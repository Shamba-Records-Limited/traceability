/**
 * HTTP client for the Hedera EVM smart contract registries.
 *
 * The publisher's `POST /v1/contracts/execute` endpoint signs a single
 * `ContractExecuteTransaction` on the operator account. This file is
 * the ABI-aware shim: it knows the function selectors and parameter
 * encodings for `PlotRegistry.attestPlot` and
 * `BatchRegistry.recordBatch`, builds the calldata, and POSTs it.
 *
 * Soft-failure contract: a network error / timeout / non-2xx / malformed
 * response returns `null` and logs a warning. The plot/batch happy
 * paths treat absence of a registry tx as "deferred"; pending rows can
 * be retried by a follow-up reconciler pass.
 *
 * The registry write is gated by env var `REGISTRY_CONTRACTS_ENABLED`:
 * deployments that don't (yet) deploy the contracts can set it to a
 * falsy value and the helpers return `null` immediately without
 * contacting the publisher.
 */

import { createHash } from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_GAS_LIMIT = 500_000;

function publisherBaseURL(): string {
  return process.env.HEDERA_PUBLISHER_URL || 'http://localhost:8080';
}

function publisherTimeout(): number {
  const raw = process.env.HEDERA_PUBLISHER_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function registryGasLimit(): number {
  const raw = process.env.HEDERA_REGISTRY_GAS_LIMIT;
  if (!raw) return DEFAULT_GAS_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GAS_LIMIT;
}

export function registryEnabled(): boolean {
  const raw = (process.env.REGISTRY_CONTRACTS_ENABLED ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/**
 * Function selectors for the registry contracts. Computed once with
 * `keccak256("attestPlot(bytes32,bytes32,bytes32)")[:4]` etc. Hard-
 * coded here so we don't need a keccak implementation at runtime; if a
 * contract is renamed the constant changes alongside the Solidity.
 */
const SELECTOR_ATTEST_PLOT = '0xb8efb6cf';
const SELECTOR_RECORD_BATCH = '0xa7eef0bb';

export interface RegistryWriteResult {
  contractId: string;
  transactionId: string;
  consensusTimestamp: string;
}

interface PublisherExecuteResponse {
  contractId: string;
  transactionId: string;
  consensusTimestamp: string;
  gasUsed: number;
}

function parseExecuteResponse(raw: unknown): PublisherExecuteResponse | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.contractId !== 'string' ||
    r.contractId.length === 0 ||
    typeof r.transactionId !== 'string' ||
    r.transactionId.length === 0 ||
    typeof r.consensusTimestamp !== 'string' ||
    typeof r.gasUsed !== 'number'
  ) {
    return null;
  }
  return {
    contractId: r.contractId,
    transactionId: r.transactionId,
    consensusTimestamp: r.consensusTimestamp,
    gasUsed: r.gasUsed,
  };
}

/**
 * Convert a UUID like `4b6c1f3c-72b1-4b8f-9c4f-1a3d4e5f6a7b` into a 32-byte
 * left-aligned word, hex-encoded WITHOUT the `0x` prefix. UUIDs are 16
 * bytes; we pad the remaining 16 bytes with zeros on the right.
 *
 * Exported for the publisher tests in the registry vitest suite.
 */
export function uuidToBytes32(uuid: string): string {
  const stripped = uuid.replace(/-/g, '');
  if (stripped.length !== 32 || !/^[0-9a-f]{32}$/i.test(stripped)) {
    throw new Error(`uuidToBytes32: not a hex UUID: ${uuid}`);
  }
  return (stripped + '0'.repeat(32)).toLowerCase();
}

/**
 * Convert a 64-char hex SHA-256 hash into a 32-byte word (no transform
 * needed — already 32 bytes). Asserts the format so a malformed hash
 * fails at the call site instead of producing a half-filled word.
 */
function hashToBytes32(hash: string): string {
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    throw new Error(`hashToBytes32: not a 64-char hex string: ${hash}`);
  }
  return hash.toLowerCase();
}

async function executeContract(input: {
  contractId: string;
  functionSelector: string;
  argsHex: string;
  gasLimit?: number;
}): Promise<RegistryWriteResult | null> {
  const url = `${publisherBaseURL().replace(/\/$/, '')}/v1/contracts/execute`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), publisherTimeout());

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contractId: input.contractId,
        functionSelector: input.functionSelector,
        argsHex: `0x${input.argsHex}`,
        gasLimit: input.gasLimit ?? registryGasLimit(),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn('[registry] non-2xx response', { status: response.status, url });
      return null;
    }
    const raw = (await response.json()) as unknown;
    const body = parseExecuteResponse(raw);
    if (!body) {
      console.warn('[registry] malformed response body', { url });
      return null;
    }
    return {
      contractId: body.contractId,
      transactionId: body.transactionId,
      consensusTimestamp: body.consensusTimestamp,
    };
  } catch (error) {
    console.warn('[registry] execute failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call `PlotRegistry.attestPlot(plotId, payloadHash, geometryHash)`. Returns
 * `null` if the registry is disabled by env var, or if the call soft-fails.
 *
 * `plotId` is the application UUID. `payloadHash` is the SHA-256 hex of the
 * canonical off-chain plot payload (same value committed to HCS).
 * `geometryHash` is the SHA-256 hex of the GeoJSON geometry — computed here
 * so the call site doesn't need to round-trip through PostGIS for the
 * canonical bytes.
 */
export async function attestPlotOnChain(input: {
  plotId: string;
  payloadHash: string;
  geometryGeoJson: unknown;
}): Promise<RegistryWriteResult | null> {
  if (!registryEnabled()) return null;
  const contractId = (process.env.HEDERA_PLOT_REGISTRY_ID ?? '').trim();
  if (!contractId) {
    console.warn('[registry] HEDERA_PLOT_REGISTRY_ID is unset; skipping plot attestation');
    return null;
  }
  const geometryCanonical = JSON.stringify(input.geometryGeoJson);
  const geometryHash = createHash('sha256').update(geometryCanonical, 'utf8').digest('hex');
  const argsHex =
    uuidToBytes32(input.plotId) + hashToBytes32(input.payloadHash) + hashToBytes32(geometryHash);
  return executeContract({
    contractId,
    functionSelector: SELECTOR_ATTEST_PLOT,
    argsHex,
  });
}

/**
 * Call `BatchRegistry.recordBatch(batchId, payloadHash, parentBatchIds[])`.
 * Encodes parents as a dynamic `bytes32[]` per Solidity ABI: offset to the
 * tail, then length, then each element. Returns `null` if the registry is
 * disabled or the call soft-fails.
 */
export async function recordBatchOnChain(input: {
  batchId: string;
  payloadHash: string;
  parentBatchIds: ReadonlyArray<string>;
}): Promise<RegistryWriteResult | null> {
  if (!registryEnabled()) return null;
  const contractId = (process.env.HEDERA_BATCH_REGISTRY_ID ?? '').trim();
  if (!contractId) {
    console.warn('[registry] HEDERA_BATCH_REGISTRY_ID is unset; skipping batch record');
    return null;
  }

  // Solidity ABI for (bytes32, bytes32, bytes32[]):
  //   word 0: batchId (32 bytes)
  //   word 1: payloadHash (32 bytes)
  //   word 2: offset to the dynamic array (0x60 = 96 = 3 * 32)
  //   word 3: array length
  //   word 4..: array elements
  const batchWord = uuidToBytes32(input.batchId);
  const payloadWord = hashToBytes32(input.payloadHash);
  const offsetWord = '0'.repeat(62) + '60'; // 0x60 = 96
  const lengthWord = input.parentBatchIds.length.toString(16).padStart(64, '0');
  const parentsWords = input.parentBatchIds.map((id) => uuidToBytes32(id)).join('');

  const argsHex = batchWord + payloadWord + offsetWord + lengthWord + parentsWords;

  return executeContract({
    contractId,
    functionSelector: SELECTOR_RECORD_BATCH,
    argsHex,
  });
}

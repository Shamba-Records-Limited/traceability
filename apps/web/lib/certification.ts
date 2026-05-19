import { createHash } from 'node:crypto';

import { and, desc, eq, isNull } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from './db';
import { canonicaliseJson } from './json-canonical';
import { publishEvent } from './hedera-publisher';
// Re-export the pure constants from a sibling module so existing
// consumers don't need to switch imports. Client components should
// import directly from `./certification-schemes` to avoid pulling the
// DB driver into the browser bundle.
import {
  CERTIFICATION_SCHEMES,
  CERTIFICATION_SCHEME_LABELS,
  type CertificationScheme,
} from './certification-schemes';
export {
  CERTIFICATION_SCHEMES,
  CERTIFICATION_SCHEME_LABELS,
  type CertificationScheme,
} from './certification-schemes';

const { actors, batches, certifications, events } = schema;

export class CertificationError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'CertificationError';
  }
}

export interface AttachCertificationInput {
  batchId: string;
  attestedByActorId: string;
  scheme: CertificationScheme;
  issuer: string;
  certificateNumber: string;
  validFrom: Date;
  validUntil: Date;
  evidenceUri?: string | null;
  notes?: string | null;
  /** Scheme-specific structured details. Optional. */
  payload?: Record<string, unknown>;
}

/**
 * Attach a voluntary-scheme certification to a batch. Persists the row
 * + emits a `certification_attached` event whose payload hash is
 * committed on HCS, mirroring the rest of the audit-trail pattern.
 * Only the current custodian can attach a certification.
 */
export async function attachCertification(input: AttachCertificationInput): Promise<{
  certificationId: string;
  eventId: string;
  onChainTopicId: string | null;
}> {
  if (!CERTIFICATION_SCHEMES.includes(input.scheme)) {
    throw new CertificationError(400, `unsupported scheme: ${input.scheme}`);
  }
  if (!input.issuer.trim()) throw new CertificationError(400, 'issuer is required');
  if (!input.certificateNumber.trim()) {
    throw new CertificationError(400, 'certificateNumber is required');
  }
  if (input.validFrom > input.validUntil) {
    throw new CertificationError(400, 'validFrom must not be after validUntil');
  }

  const [batch] = await db
    .select({ id: batches.id, custodianActorId: batches.custodianActorId })
    .from(batches)
    .where(eq(batches.id, input.batchId))
    .limit(1);
  if (!batch) throw new CertificationError(404, 'batch not found');
  if (batch.custodianActorId !== input.attestedByActorId) {
    throw new CertificationError(403, 'only the current custodian can attach a certification');
  }

  const [actor] = await db
    .select({ did: actors.did })
    .from(actors)
    .where(eq(actors.id, input.attestedByActorId))
    .limit(1);
  if (!actor) throw new CertificationError(500, 'actor row missing');

  const payload = input.payload ?? {};
  const canonicalPayload = canonicaliseJson({
    scheme: input.scheme,
    issuer: input.issuer.trim(),
    certificateNumber: input.certificateNumber.trim(),
    validFrom: input.validFrom.toISOString().slice(0, 10),
    validUntil: input.validUntil.toISOString().slice(0, 10),
    evidenceUri: input.evidenceUri?.trim() || null,
    payload,
  });
  const payloadHash = createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');

  const now = new Date();

  const { certificationId, eventId, eventPayload } = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(certifications)
      .values({
        batchId: input.batchId,
        attestedByActorId: input.attestedByActorId,
        scheme: input.scheme,
        issuer: input.issuer.trim(),
        certificateNumber: input.certificateNumber.trim(),
        validFrom: input.validFrom.toISOString().slice(0, 10),
        validUntil: input.validUntil.toISOString().slice(0, 10),
        evidenceUri: input.evidenceUri?.trim() || null,
        payload,
        payloadHash,
        notes: input.notes?.trim() || null,
      })
      .returning({ id: certifications.id });
    if (!row) throw new Error('certification insert returned no rows');

    const eid = crypto.randomUUID();
    const epayload = {
      v: 1 as const,
      type: 'certification_attached' as const,
      batchId: input.batchId,
      certificationId: row.id,
      scheme: input.scheme,
      issuer: input.issuer.trim(),
      certificateNumber: input.certificateNumber.trim(),
      validFrom: input.validFrom.toISOString().slice(0, 10),
      validUntil: input.validUntil.toISOString().slice(0, 10),
      attestedAt: now.toISOString(),
    };
    await tx.insert(events).values({
      id: eid,
      batchId: input.batchId,
      type: 'certification_attached',
      emittedAt: now,
      emittedByDid: actor.did,
      payload: epayload,
      payloadHash,
    });
    return { certificationId: row.id, eventId: eid, eventPayload: epayload };
  });

  const publish = await publishEvent('', {
    v: 1 as const,
    type: 'certification_attached' as const,
    batchId: input.batchId,
    certificationId,
    emittedAt: eventPayload.attestedAt,
    emittedByDid: actor.did,
    payloadHash,
  });
  if (publish) {
    try {
      await db
        .update(events)
        .set({
          onChainTopicId: publish.topicId,
          onChainSequenceNumber: publish.sequenceNumber,
          onChainConsensusTimestamp: new Date(publish.consensusTimestamp),
          onChainTransactionId: publish.transactionId,
        })
        .where(eq(events.id, eventId));
    } catch (error) {
      console.error('[certification] HCS publish backfill failed', {
        certificationId,
        eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { certificationId, eventId, onChainTopicId: publish?.topicId ?? null };
}

/**
 * Soft-revoke a certification. Marks the row revoked but keeps it in
 * the audit trail (and any future `certification_revoked` event needs
 * the row to remain visible).
 */
export async function revokeCertification(input: {
  certificationId: string;
  actorId: string;
}): Promise<boolean> {
  // Ownership-implicit via the batch custodian. Look up the batch.
  const [row] = await db
    .select({ batchId: certifications.batchId, revokedAt: certifications.revokedAt })
    .from(certifications)
    .where(eq(certifications.id, input.certificationId))
    .limit(1);
  if (!row) return false;
  if (row.revokedAt) return false;
  const [batch] = await db
    .select({ custodianActorId: batches.custodianActorId })
    .from(batches)
    .where(eq(batches.id, row.batchId))
    .limit(1);
  if (!batch || batch.custodianActorId !== input.actorId) return false;
  const updated = await db
    .update(certifications)
    .set({ revokedAt: new Date() })
    .where(and(eq(certifications.id, input.certificationId), isNull(certifications.revokedAt)))
    .returning({ id: certifications.id });
  return updated.length === 1;
}

export async function listCertificationsForBatch(batchId: string) {
  return db
    .select({
      id: certifications.id,
      scheme: certifications.scheme,
      issuer: certifications.issuer,
      certificateNumber: certifications.certificateNumber,
      validFrom: certifications.validFrom,
      validUntil: certifications.validUntil,
      evidenceUri: certifications.evidenceUri,
      notes: certifications.notes,
      attestedAt: certifications.attestedAt,
      revokedAt: certifications.revokedAt,
    })
    .from(certifications)
    .where(eq(certifications.batchId, batchId))
    .orderBy(desc(certifications.attestedAt));
}

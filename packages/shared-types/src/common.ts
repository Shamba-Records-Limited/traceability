import { z } from 'zod';

/**
 * 32-byte hex-encoded hash (SHA-256), with optional `0x` prefix stripped on parse.
 */
export const hashSchema = z
  .string()
  .transform((s) => (s.startsWith('0x') ? s.slice(2) : s))
  .pipe(z.string().regex(/^[0-9a-f]{64}$/, 'must be a 32-byte hex string'));
export type Hash = z.infer<typeof hashSchema>;

/**
 * ISO 8601 timestamp with timezone (e.g. `2026-05-16T10:30:00Z`).
 */
export const iso8601Schema = z
  .string()
  .datetime({ offset: true, message: 'must be an ISO 8601 timestamp with timezone' });
export type Iso8601 = z.infer<typeof iso8601Schema>;

/**
 * UUID v4 in canonical form.
 */
export const uuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof uuidSchema>;

/**
 * IPFS CIDv1 (base32). Loose validation; deep validation happens at write time
 * in the storage adapter, which can compute the CID from the content itself.
 */
export const ipfsCidSchema = z
  .string()
  .regex(/^b[a-z2-7]{58,}$/, 'must be an IPFS CIDv1 (base32, starts with `b`)');
export type IpfsCid = z.infer<typeof ipfsCidSchema>;

/**
 * Hedera entity ID in `shard.realm.num` form, e.g. `0.0.123456`.
 */
export const hederaIdSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'must be a Hedera id in `shard.realm.num` form');
export type HederaId = z.infer<typeof hederaIdSchema>;

/**
 * ISO 3166-1 alpha-2 country code (uppercase).
 */
export const countryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, 'must be an ISO 3166-1 alpha-2 country code (uppercase)');
export type CountryCode = z.infer<typeof countryCodeSchema>;

/**
 * ISO 4217 currency code (uppercase).
 */
export const currencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'must be an ISO 4217 currency code (uppercase)');
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;

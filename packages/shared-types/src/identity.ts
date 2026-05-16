import { z } from 'zod';

import { iso8601Schema } from './common';

/**
 * Decentralized Identifier per the W3C DID Core spec, restricted to the
 * methods we currently support. `did:hedera` is the default; `did:web` is
 * accepted for legacy integrations where a counter-party publishes their
 * identifier via DNS.
 */
export const didSchema = z
  .string()
  .regex(
    /^did:(hedera|web):[A-Za-z0-9._:\-/%]+$/,
    'must be a valid DID using a supported method (hedera, web)',
  );
export type Did = z.infer<typeof didSchema>;

/**
 * A subset of the W3C Verifiable Credentials Data Model 2.0 that captures
 * what our system issues and verifies. Not every optional field of the spec
 * is modelled; we add fields as use-cases require them.
 */
export const verifiableCredentialSchema = z.object({
  '@context': z.array(z.string().url()).min(1),
  id: z.string().url().optional(),
  type: z.array(z.string()).min(2), // at least ['VerifiableCredential', '<concrete type>']
  issuer: z.union([didSchema, z.object({ id: didSchema })]),
  validFrom: iso8601Schema.optional(),
  validUntil: iso8601Schema.optional(),
  credentialSubject: z.record(z.string(), z.unknown()),
  credentialStatus: z
    .object({
      id: z.string().url(),
      type: z.string(),
    })
    .optional(),
  proof: z.record(z.string(), z.unknown()).optional(),
});
export type VerifiableCredential = z.infer<typeof verifiableCredentialSchema>;

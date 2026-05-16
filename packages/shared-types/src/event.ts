import { z } from 'zod';

import { hashSchema, hederaIdSchema, ipfsCidSchema, iso8601Schema, uuidSchema } from './common.js';

/**
 * The on-chain (HCS) event vocabulary for a batch. Each event is a single HCS
 * message whose payload is a hash commitment of the off-chain canonical event;
 * the full payload is retrieved off-chain.
 *
 * The vocabulary is closed and versioned. Adding a new event type is an ADR-
 * worthy change because downstream consumers must be able to parse the stream.
 */
export const eventTypeSchema = z.enum([
  'batch_created',
  'plot_attested',
  'sample_recorded',
  'certification_attached',
  'handoff_proposed',
  'handoff_dispatched',
  'handoff_received',
  'batch_split',
  'batch_merged',
  'batch_exported',
  'batch_imported',
  'dds_issued',
  'dds_accepted',
  'batch_voided',
]);
export type EventType = z.infer<typeof eventTypeSchema>;

/**
 * The on-chain commitment for a single event. The full event payload is held
 * off-chain; only this struct is written to HCS.
 */
export const eventCommitmentSchema = z.object({
  v: z.literal(1), // schema version
  type: eventTypeSchema,
  batchId: uuidSchema,
  emittedAt: iso8601Schema,
  emittedByDid: z.string(), // DID of the actor who emitted the event
  payloadHash: hashSchema, // SHA-256 of the canonical off-chain payload
  payloadCid: ipfsCidSchema.optional(), // optional IPFS pointer
  topicId: hederaIdSchema, // the HCS topic this event lives on
});
export type EventCommitment = z.infer<typeof eventCommitmentSchema>;

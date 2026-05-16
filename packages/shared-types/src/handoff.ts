import { z } from 'zod';

import { hashSchema, iso8601Schema, ipfsCidSchema, uuidSchema } from './common';

/**
 * A chain-of-custody handoff between two actors. The receiver must confirm
 * the handoff for it to be considered settled; until then the handoff is in
 * `pending_receipt` state.
 *
 * The optional escrow fields refer to an on-chain smart contract instance
 * holding funds released on receipt (see ADR-0002).
 */
export const handoffSchema = z.object({
  id: uuidSchema,
  batchId: uuidSchema,
  fromActorId: uuidSchema,
  toActorId: uuidSchema,
  status: z.enum([
    'proposed',
    'in_transit',
    'pending_receipt',
    'received',
    'disputed',
    'cancelled',
  ]),
  proposedAt: iso8601Schema,
  dispatchedAt: iso8601Schema.optional(),
  receivedAt: iso8601Schema.optional(),
  quantity: z.number().positive(),
  unit: z.enum(['kg', 'head', 'tonne', 'm3']),
  notes: z.string().max(2000).optional(),
  evidenceCids: z.array(ipfsCidSchema).default([]),
  fromSignatureHash: hashSchema.optional(),
  toSignatureHash: hashSchema.optional(),
  escrowContractAddress: z.string().optional(),
  escrowReleased: z.boolean().default(false),
});
export type Handoff = z.infer<typeof handoffSchema>;

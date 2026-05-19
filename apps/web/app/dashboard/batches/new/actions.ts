'use server';

import { auth } from '../../../../auth';
import { getActorForUser } from '../../../../lib/actor';
import {
  BatchValidationError,
  createBatch,
  type BatchUnit,
  type ProcessingStage,
} from '../../../../lib/batch';
import type { Commodity } from '@shamba/shared-types';

export type CreateBatchState =
  | { status: 'idle' }
  | { status: 'unauthenticated' }
  | { status: 'no-actor' }
  | { status: 'error'; issues: ReadonlyArray<{ path: string; message: string }> }
  | {
      status: 'ok';
      batchId: string;
      onChainTokenId: string | null;
      onChainSerialNumber: string | null;
      onChainTopicId: string | null;
    };

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function submitCreateBatch(
  _previous: CreateBatchState,
  formData: FormData,
): Promise<CreateBatchState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };

  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  const commodity = (formData.get('commodity') ?? '') as Commodity;
  const processingStage = (formData.get('processingStage') ?? '') as ProcessingStage;
  const unit = (formData.get('unit') ?? '') as BatchUnit;
  const quantityRaw = String(formData.get('quantity') ?? '');
  const quantity = Number.parseFloat(quantityRaw);
  const productionStart = parseDate(String(formData.get('productionStart') ?? ''));
  const productionEnd = parseDate(String(formData.get('productionEnd') ?? ''));
  const sourcePlotIds = formData.getAll('sourcePlotIds').map(String).filter(Boolean);

  if (!productionStart) {
    return {
      status: 'error',
      issues: [{ path: 'productionStart', message: 'productionStart must be a valid date' }],
    };
  }
  if (!productionEnd) {
    return {
      status: 'error',
      issues: [{ path: 'productionEnd', message: 'productionEnd must be a valid date' }],
    };
  }

  try {
    const result = await createBatch({
      custodianActorId: actor.id,
      commodity,
      processingStage,
      unit,
      quantity,
      productionStart,
      productionEnd,
      sourcePlotIds,
    });
    return {
      status: 'ok',
      batchId: result.id,
      onChainTokenId: result.onChainTokenId,
      onChainSerialNumber:
        result.onChainSerialNumber === null ? null : result.onChainSerialNumber.toString(),
      onChainTopicId: result.onChainTopicId,
    };
  } catch (error) {
    if (error instanceof BatchValidationError) {
      return { status: 'error', issues: error.issues };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'error',
      issues: [{ path: 'batch', message: `createBatch failed: ${message}` }],
    };
  }
}

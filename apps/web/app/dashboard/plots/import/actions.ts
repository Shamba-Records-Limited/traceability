'use server';

import { auth } from '../../../../auth';
import { getActorForUser } from '../../../../lib/actor';
import { importPlotsFromCsv, type PlotImportResult } from '../../../../lib/plot-import';

const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MiB — ~10k rows of typical EUDR data.

export type BulkImportState =
  | { status: 'idle' }
  | { status: 'unauthenticated' }
  | { status: 'no-actor' }
  | { status: 'invalid'; message: string }
  | { status: 'done'; result: PlotImportResult };

export async function submitBulkImport(
  _previous: BulkImportState,
  formData: FormData,
): Promise<BulkImportState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };

  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  // Prefer the uploaded file when present; fall back to the textarea so
  // operators can paste a short CSV without saving it to disk.
  let csv = '';
  const file = formData.get('csvFile');
  if (file && typeof file !== 'string' && file.size > 0) {
    if (file.size > MAX_CSV_BYTES) {
      return {
        status: 'invalid',
        message: `CSV is too large (${file.size} bytes); limit is ${MAX_CSV_BYTES} bytes`,
      };
    }
    csv = await file.text();
  } else {
    csv = String(formData.get('csvText') ?? '');
    if (csv.length > MAX_CSV_BYTES) {
      return {
        status: 'invalid',
        message: `CSV is too large (${csv.length} bytes); limit is ${MAX_CSV_BYTES} bytes`,
      };
    }
  }

  if (!csv.trim()) {
    return { status: 'invalid', message: 'Upload a CSV file or paste rows into the textarea.' };
  }

  const result = await importPlotsFromCsv({ ownerActorId: actor.id, csv });
  return { status: 'done', result };
}

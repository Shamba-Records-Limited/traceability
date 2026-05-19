'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '../../../../../auth';
import { getActorForUser } from '../../../../../lib/actor';
import {
  CERTIFICATION_SCHEMES,
  CertificationError,
  attachCertification,
  revokeCertification,
  type CertificationScheme,
} from '../../../../../lib/certification';

export type AttachState =
  | { status: 'idle' }
  | { status: 'unauthenticated' }
  | { status: 'no-actor' }
  | { status: 'error'; message: string }
  | { status: 'ok'; certificationId: string };

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function submitAttachCertification(
  _prev: AttachState,
  formData: FormData,
): Promise<AttachState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };
  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  const batchId = String(formData.get('batchId') ?? '');
  if (!/^[0-9a-f-]{32,36}$/i.test(batchId)) {
    return { status: 'error', message: 'Invalid batch id.' };
  }
  const scheme = String(formData.get('scheme') ?? '') as CertificationScheme;
  if (!(CERTIFICATION_SCHEMES as ReadonlyArray<string>).includes(scheme)) {
    return { status: 'error', message: 'Invalid scheme.' };
  }
  const issuer = String(formData.get('issuer') ?? '').trim();
  const certificateNumber = String(formData.get('certificateNumber') ?? '').trim();
  const evidenceUri = String(formData.get('evidenceUri') ?? '').trim() || undefined;
  const notes = String(formData.get('notes') ?? '').trim() || undefined;
  const validFrom = parseDate(String(formData.get('validFrom') ?? ''));
  const validUntil = parseDate(String(formData.get('validUntil') ?? ''));
  if (!validFrom || !validUntil) {
    return { status: 'error', message: 'validFrom and validUntil must be valid dates.' };
  }

  try {
    const result = await attachCertification({
      batchId,
      attestedByActorId: actor.id,
      scheme,
      issuer,
      certificateNumber,
      validFrom,
      validUntil,
      evidenceUri,
      notes,
    });
    revalidatePath(`/dashboard/batches/${batchId}/certifications`);
    revalidatePath(`/trace/${batchId}`);
    return { status: 'ok', certificationId: result.certificationId };
  } catch (error) {
    if (error instanceof CertificationError) {
      return { status: 'error', message: error.message };
    }
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

export type RevokeState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'ok' };

export async function submitRevokeCertification(
  _prev: RevokeState,
  formData: FormData,
): Promise<RevokeState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'error', message: 'unauthenticated' };
  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'error', message: 'no-actor' };
  const certificationId = String(formData.get('certificationId') ?? '');
  const batchId = String(formData.get('batchId') ?? '');
  if (!/^[0-9a-f-]{32,36}$/i.test(certificationId)) {
    return { status: 'error', message: 'Invalid id.' };
  }
  const ok = await revokeCertification({ certificationId, actorId: actor.id });
  if (!ok) return { status: 'error', message: 'Not found or already revoked.' };
  if (/^[0-9a-f-]{32,36}$/i.test(batchId)) {
    revalidatePath(`/dashboard/batches/${batchId}/certifications`);
    revalidatePath(`/trace/${batchId}`);
  }
  return { status: 'ok' };
}

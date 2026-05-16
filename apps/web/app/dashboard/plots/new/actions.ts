'use server';

import { redirect } from 'next/navigation';

import { auth } from '../../../../auth';
import { getActorForUser } from '../../../../lib/actor';
import { registerPlot, PlotValidationError, type RegisterPlotInput } from '../../../../lib/plot';
import type { Commodity, PlotGeometry } from '@shamba/shared-types';

const ALLOWED_COMMODITIES: ReadonlySet<Commodity> = new Set([
  'cattle',
  'cocoa',
  'coffee',
  'oil_palm',
  'rubber',
  'soya',
  'wood',
]);

export type RegisterPlotState =
  | { status: 'idle' }
  | { status: 'unauthenticated' }
  | { status: 'no-actor' }
  | { status: 'error'; issues: ReadonlyArray<{ path: string; message: string }> };

function parseGeometry(
  raw: string,
): { ok: true; value: PlotGeometry } | { ok: false; message: string } {
  if (!raw.trim()) {
    return { ok: false, message: 'paste a GeoJSON Point or Polygon geometry' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'geometry must be valid JSON' };
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !('type' in parsed) ||
    !('coordinates' in parsed)
  ) {
    return { ok: false, message: 'geometry must be a GeoJSON object with type and coordinates' };
  }
  const t = (parsed as { type: unknown }).type;
  if (t !== 'Point' && t !== 'Polygon') {
    return { ok: false, message: 'geometry type must be Point or Polygon' };
  }
  return { ok: true, value: parsed as PlotGeometry };
}

export async function submitRegisterPlot(
  _previous: RegisterPlotState,
  formData: FormData,
): Promise<RegisterPlotState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };

  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  const commodities = formData.getAll('commodities').map(String).filter(Boolean) as Commodity[];
  const invalidCommodity = commodities.find((c) => !ALLOWED_COMMODITIES.has(c));

  const geometryParse = parseGeometry(String(formData.get('geometry') ?? ''));

  const issues: { path: string; message: string }[] = [];
  if (commodities.length === 0) {
    issues.push({ path: 'commodities', message: 'select at least one commodity' });
  }
  if (invalidCommodity) {
    issues.push({ path: 'commodities', message: `unsupported commodity: ${invalidCommodity}` });
  }
  if (!geometryParse.ok) {
    issues.push({ path: 'geometry', message: geometryParse.message });
  }

  if (issues.length > 0) {
    return { status: 'error', issues };
  }

  // Production date inputs are captured by the form for forward
  // compatibility but live on batches, not plots. They will be threaded
  // through once batch creation lands.
  const input: RegisterPlotInput = {
    ownerActorId: actor.id,
    country: String(formData.get('country') ?? actor.country),
    subnational: String(formData.get('subnational') ?? '').trim() || undefined,
    commodities,
    geometry: (geometryParse as { ok: true; value: PlotGeometry }).value,
  };

  try {
    await registerPlot(input);
  } catch (error) {
    if (error instanceof PlotValidationError) {
      return { status: 'error', issues: error.issues };
    }
    throw error;
  }

  redirect('/dashboard/plots');
}

import Papa from 'papaparse';

import type { Commodity, PlotGeometry } from '@shamba/shared-types';

import { registerPlot, PlotValidationError, type RegisterPlotInput } from './plot';

/**
 * CSV column shape for bulk plot import. The geometry column carries a
 * GeoJSON object as a quoted, RFC 4180-escaped string. Commodities use
 * semicolons (CSV columns aren't safe for nested commas) — for example
 * `coffee;cocoa` for a multi-commodity plot.
 *
 * | column        | required | example                                    |
 * | ------------- | -------- | ------------------------------------------ |
 * | `country`     | yes      | `KE`                                       |
 * | `commodities` | yes      | `coffee` or `coffee;cocoa`                 |
 * | `geometry`    | yes      | `{"type":"Polygon","coordinates":[...]}`   |
 * | `subnational` | no       | `Kiambu County`                            |
 *
 * Lines starting with `#` are treated as comments and skipped. Empty
 * lines are skipped. Rows with extra columns are accepted; rows with
 * missing required columns surface a per-row error in the result set.
 */

export interface PlotImportRowResult {
  rowNumber: number;
  status: 'ok' | 'error';
  /** Plot id when status === 'ok', undefined otherwise. */
  plotId?: string;
  /** On-chain topic id when the publisher commit landed inside the same request. */
  onChainTopicId?: string;
  /** Per-field issues when status === 'error'. */
  issues?: ReadonlyArray<{ path: string; message: string }>;
}

export interface PlotImportResult {
  totalRows: number;
  succeeded: number;
  failed: number;
  rows: PlotImportRowResult[];
}

interface ParsedCsvRow {
  country?: string;
  commodities?: string;
  geometry?: string;
  subnational?: string;
}

const ALLOWED_COMMODITIES: ReadonlySet<Commodity> = new Set([
  'cattle',
  'cocoa',
  'coffee',
  'oil_palm',
  'rubber',
  'soya',
  'wood',
]);

function parseCommodityList(raw: string | undefined): Commodity[] | { error: string } {
  if (!raw || !raw.trim()) {
    return { error: 'commodities is required (semicolon-delimited, e.g. coffee;cocoa)' };
  }
  const tokens = raw
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return { error: 'commodities is required' };
  }
  const unsupported = tokens.find((t) => !ALLOWED_COMMODITIES.has(t as Commodity));
  if (unsupported) {
    return { error: `unsupported commodity: ${unsupported}` };
  }
  return tokens as Commodity[];
}

function parseGeometry(raw: string | undefined): PlotGeometry | { error: string } {
  if (!raw || !raw.trim()) {
    return { error: 'geometry is required (GeoJSON Point or Polygon)' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'geometry must be valid JSON' };
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !('type' in parsed) ||
    !('coordinates' in parsed)
  ) {
    return { error: 'geometry must be a GeoJSON object with type and coordinates' };
  }
  const t = (parsed as { type: unknown }).type;
  if (t !== 'Point' && t !== 'Polygon') {
    return { error: 'geometry type must be Point or Polygon' };
  }
  return parsed as PlotGeometry;
}

/**
 * Parse a CSV body and import every row as a plot for the supplied actor.
 * Returns a per-row report. The implementation deliberately processes
 * rows sequentially so a slow registerPlot (deforestation provider +
 * HCS publish) does not flood the publisher with concurrent calls; a
 * future PR can introduce a bounded concurrency pool once we have
 * end-to-end latency data.
 */
export async function importPlotsFromCsv(input: {
  ownerActorId: string;
  csv: string;
}): Promise<PlotImportResult> {
  const parsed = Papa.parse<ParsedCsvRow>(input.csv, {
    header: true,
    skipEmptyLines: 'greedy',
    comments: '#',
    transformHeader: (h: string) => h.trim().toLowerCase(),
    transform: (value: string) => value.trim(),
  });

  const rows: PlotImportRowResult[] = [];

  for (const [index, raw] of (parsed.data ?? []).entries()) {
    // CSV rows in the report are 1-indexed AND we account for the header row
    // so an operator can correlate a complaint with their spreadsheet
    // exactly (line numbers in the source file).
    const rowNumber = index + 2;

    const country = raw.country;
    if (!country) {
      rows.push({
        rowNumber,
        status: 'error',
        issues: [{ path: 'country', message: 'country is required (ISO 3166-1 alpha-2)' }],
      });
      continue;
    }

    const commoditiesOrError = parseCommodityList(raw.commodities);
    if ('error' in commoditiesOrError) {
      rows.push({
        rowNumber,
        status: 'error',
        issues: [{ path: 'commodities', message: commoditiesOrError.error }],
      });
      continue;
    }

    const geometryOrError = parseGeometry(raw.geometry);
    if ('error' in geometryOrError) {
      rows.push({
        rowNumber,
        status: 'error',
        issues: [{ path: 'geometry', message: geometryOrError.error }],
      });
      continue;
    }

    const registerInput: RegisterPlotInput = {
      ownerActorId: input.ownerActorId,
      country,
      subnational: raw.subnational || undefined,
      commodities: commoditiesOrError,
      geometry: geometryOrError,
    };

    try {
      const registered = await registerPlot(registerInput);
      rows.push({
        rowNumber,
        status: 'ok',
        plotId: registered.id,
        onChainTopicId: registered.onChainTopicId ?? undefined,
      });
    } catch (error) {
      if (error instanceof PlotValidationError) {
        rows.push({ rowNumber, status: 'error', issues: error.issues });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        rows.push({
          rowNumber,
          status: 'error',
          issues: [{ path: 'row', message: `registerPlot failed: ${message}` }],
        });
      }
    }
  }

  return {
    totalRows: rows.length,
    succeeded: rows.filter((r) => r.status === 'ok').length,
    failed: rows.filter((r) => r.status === 'error').length,
    rows,
  };
}

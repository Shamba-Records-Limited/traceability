import { customType } from 'drizzle-orm/pg-core';

/**
 * PostGIS `geography` column type. Drizzle does not yet ship a first-class
 * geography type, so we declare one with the right DDL and pass values through
 * as strings (Well-Known Text). Application code converts between GeoJSON and
 * WKT at the boundary using `geometry-helpers.ts` (added when the first writer
 * route lands).
 *
 * Defaults to `geography(GEOMETRY, 4326)` because EUDR Article 9(1)(d) mandates
 * WGS 84 (SRID 4326). Specify `type` to constrain a column to POINT or POLYGON.
 */
export interface GeographyOptions {
  type?: 'GEOMETRY' | 'POINT' | 'POLYGON';
  srid?: number;
}

export const geography = (options: GeographyOptions = {}) =>
  customType<{ data: string; driverData: string }>({
    dataType() {
      const { type = 'GEOMETRY', srid = 4326 } = options;
      return `geography(${type}, ${srid})`;
    },
  });

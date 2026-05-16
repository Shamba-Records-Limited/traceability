import { z } from 'zod';

/**
 * GeoJSON-shaped geometry types restricted to what the EUDR plot-of-land
 * geolocation requirement uses (Article 9(1)(d) of Regulation 2023/1115).
 *
 * Coordinates are always `[longitude, latitude]` in decimal degrees, WGS 84.
 * Plots ≤ 4 ha may be represented as a Point; plots > 4 ha must be a Polygon.
 */

const longitudeSchema = z.number().gte(-180).lte(180);
const latitudeSchema = z.number().gte(-90).lte(90);

export const positionSchema = z.tuple([longitudeSchema, latitudeSchema]);
export type Position = z.infer<typeof positionSchema>;

export const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: positionSchema,
});
export type Point = z.infer<typeof pointSchema>;

/**
 * A polygon ring: a closed sequence of positions where the first and last
 * positions are equal. EUDR plots use a single exterior ring; we allow inner
 * rings (holes) for forestry use cases.
 */
const linearRingSchema = z
  .array(positionSchema)
  .min(4, 'a linear ring needs at least 4 positions (3 corners + closing)')
  .refine(
    (ring) => {
      const first = ring[0];
      const last = ring[ring.length - 1];
      return first[0] === last[0] && first[1] === last[1];
    },
    { message: 'first and last positions of a linear ring must be equal' },
  );

export const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(linearRingSchema).min(1),
});
export type Polygon = z.infer<typeof polygonSchema>;

export const plotGeometrySchema = z.discriminatedUnion('type', [pointSchema, polygonSchema]);
export type PlotGeometry = z.infer<typeof plotGeometrySchema>;

/**
 * EUDR threshold above which a plot of land must be expressed as a polygon
 * rather than a point.
 */
export const EUDR_POLYGON_THRESHOLD_HECTARES = 4;

import { describe, expect, it } from 'vitest';

import { plotSchema } from './plot';

const baseValidPolygonPlot = {
  id: '11111111-1111-4111-8111-111111111111',
  ownerActorId: '22222222-2222-4222-8222-222222222222',
  country: 'KE',
  commodities: ['coffee'],
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [36.8, -1.3],
        [36.9, -1.3],
        [36.9, -1.2],
        [36.8, -1.2],
        [36.8, -1.3],
      ],
    ],
  },
  areaHectares: 5,
  registeredAt: '2026-05-01T08:00:00Z',
  createdAt: '2026-05-01T08:00:00Z',
  updatedAt: '2026-05-01T08:00:00Z',
};

describe('plotSchema', () => {
  it('accepts a polygon plot larger than 4 ha', () => {
    expect(() => plotSchema.parse(baseValidPolygonPlot)).not.toThrow();
  });

  it('accepts a point plot at or below 4 ha', () => {
    const smallPointPlot = {
      ...baseValidPolygonPlot,
      areaHectares: 1.2,
      geometry: { type: 'Point' as const, coordinates: [36.85, -1.25] },
    };
    expect(() => plotSchema.parse(smallPointPlot)).not.toThrow();
  });

  it('rejects a point plot larger than 4 ha (EUDR Article 9(1)(d))', () => {
    const oversizedPointPlot = {
      ...baseValidPolygonPlot,
      geometry: { type: 'Point' as const, coordinates: [36.85, -1.25] },
    };
    const result = plotSchema.safeParse(oversizedPointPlot);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.join('\n')).toContain('larger than 4 hectares');
    }
  });

  it('rejects a polygon whose ring is not closed', () => {
    const openRingPlot = {
      ...baseValidPolygonPlot,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [36.8, -1.3],
            [36.9, -1.3],
            [36.9, -1.2],
            [36.8, -1.2],
          ],
        ],
      },
    };
    expect(plotSchema.safeParse(openRingPlot).success).toBe(false);
  });
});

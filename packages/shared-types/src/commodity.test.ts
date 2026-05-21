import { describe, expect, it } from 'vitest';

import {
  allCommodities,
  commodityDefaultUnit,
  commodityLabel,
  commoditySchema,
  eudrCommoditySchema,
  extendedCommoditySchema,
  isEudrRegulated,
  type Commodity,
} from './commodity';

describe('eudrCommoditySchema', () => {
  it('accepts all seven Annex I commodities', () => {
    const annexI = ['cattle', 'cocoa', 'coffee', 'oil_palm', 'rubber', 'soya', 'wood'];
    for (const c of annexI) {
      expect(eudrCommoditySchema.safeParse(c).success).toBe(true);
    }
  });

  it('rejects non-EUDR commodities', () => {
    for (const c of ['tea', 'avocado', 'maize', 'flowers']) {
      expect(eudrCommoditySchema.safeParse(c).success).toBe(false);
    }
  });
});

describe('extendedCommoditySchema', () => {
  it('accepts the major Kenyan agri exports', () => {
    for (const c of ['tea', 'avocado', 'macadamia', 'flowers', 'maize']) {
      expect(extendedCommoditySchema.safeParse(c).success).toBe(true);
    }
  });

  it('does NOT accept EUDR Annex I commodities', () => {
    for (const c of ['cattle', 'cocoa', 'coffee', 'wood']) {
      expect(extendedCommoditySchema.safeParse(c).success).toBe(false);
    }
  });
});

describe('commoditySchema (union)', () => {
  it('accepts both EUDR Annex I and extended commodities', () => {
    for (const c of ['coffee', 'tea', 'avocado', 'wood', 'maize', 'fish']) {
      expect(commoditySchema.safeParse(c).success).toBe(true);
    }
  });

  it('rejects unknown strings', () => {
    expect(commoditySchema.safeParse('unicorn').success).toBe(false);
    expect(commoditySchema.safeParse('').success).toBe(false);
  });
});

describe('isEudrRegulated', () => {
  it('returns true for every Annex I commodity', () => {
    for (const c of eudrCommoditySchema.options) {
      expect(isEudrRegulated(c)).toBe(true);
    }
  });

  it('returns false for every extended commodity', () => {
    for (const c of extendedCommoditySchema.options) {
      // Cast through Commodity since extended values are valid Commodities
      // but never EudrCommodities.
      expect(isEudrRegulated(c as Commodity)).toBe(false);
    }
  });

  it('narrows the type of an EUDR-regulated commodity', () => {
    const c: Commodity = 'coffee';
    if (isEudrRegulated(c)) {
      // Compile-time check: this expression must type-check as EudrCommodity.
      const _e: 'cattle' | 'cocoa' | 'coffee' | 'oil_palm' | 'rubber' | 'soya' | 'wood' = c;
      expect(_e).toBe('coffee');
    } else {
      throw new Error('expected coffee to be EUDR-regulated');
    }
  });
});

describe('catalog metadata', () => {
  it('lists every commodity in allCommodities exactly once', () => {
    const set = new Set(allCommodities);
    expect(set.size).toBe(allCommodities.length);
  });

  it('has a label for every commodity', () => {
    for (const c of allCommodities) {
      expect(commodityLabel[c]).toBeTruthy();
    }
  });

  it('has a default unit for every commodity', () => {
    for (const c of allCommodities) {
      expect(['kg', 'head', 'litre']).toContain(commodityDefaultUnit[c]);
    }
  });

  it('puts EUDR Annex I commodities first in catalog order', () => {
    const eudrCount = eudrCommoditySchema.options.length;
    expect(allCommodities.slice(0, eudrCount)).toEqual(eudrCommoditySchema.options);
  });
});

import { describe, expect, it } from 'vitest';

import { canonicaliseJson } from './json-canonical';

describe('canonicaliseJson', () => {
  it('sorts object keys deterministically', () => {
    const a = canonicaliseJson({ b: 1, a: 2 });
    const b = canonicaliseJson({ a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1}');
  });

  it('recurses into nested objects', () => {
    const a = canonicaliseJson({ z: { y: 1, x: 2 }, a: { c: 3, b: 4 } });
    expect(a).toBe('{"a":{"b":4,"c":3},"z":{"x":2,"y":1}}');
  });

  it('preserves array order', () => {
    expect(canonicaliseJson({ items: [3, 1, 2] })).toBe('{"items":[3,1,2]}');
  });

  it('handles primitives at the root', () => {
    expect(canonicaliseJson('foo')).toBe('"foo"');
    expect(canonicaliseJson(42)).toBe('42');
    expect(canonicaliseJson(null)).toBe('null');
  });

  it('returns the same string for equivalent objects in different construction orders', () => {
    const x: Record<string, unknown> = {};
    x.beta = 2;
    x.alpha = 1;
    const y: Record<string, unknown> = {};
    y.alpha = 1;
    y.beta = 2;
    expect(canonicaliseJson(x)).toBe(canonicaliseJson(y));
  });
});

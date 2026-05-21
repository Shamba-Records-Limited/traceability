import { describe, expect, it } from 'vitest';

import { API_SCOPES, API_SCOPE_GROUPS, isWriteScope } from './api-scopes';

describe('api-scopes', () => {
  it('includes the four write scopes', () => {
    expect(API_SCOPES).toContain('plots:write');
    expect(API_SCOPES).toContain('batches:write');
    expect(API_SCOPES).toContain('handoffs:write');
    expect(API_SCOPES).toContain('certifications:write');
  });

  it('still includes the original read scopes (backwards compatible)', () => {
    for (const s of [
      'plots:read',
      'batches:read',
      'events:read',
      'lineage:read',
      'dds:read',
    ] as const) {
      expect(API_SCOPES).toContain(s);
    }
  });

  it('groups every scope into exactly one of read/write', () => {
    const grouped = new Set<string>([...API_SCOPE_GROUPS.read, ...API_SCOPE_GROUPS.write]);
    for (const s of API_SCOPES) expect(grouped.has(s)).toBe(true);
    // No overlap between groups.
    for (const s of API_SCOPE_GROUPS.read) expect(API_SCOPE_GROUPS.write).not.toContain(s);
  });

  it('isWriteScope flags writes but not reads', () => {
    expect(isWriteScope('plots:write')).toBe(true);
    expect(isWriteScope('batches:write')).toBe(true);
    expect(isWriteScope('handoffs:write')).toBe(true);
    expect(isWriteScope('certifications:write')).toBe(true);
    expect(isWriteScope('plots:read')).toBe(false);
    expect(isWriteScope('batches:read')).toBe(false);
    expect(isWriteScope('events:read')).toBe(false);
    expect(isWriteScope('lineage:read')).toBe(false);
    expect(isWriteScope('dds:read')).toBe(false);
    expect(isWriteScope('handoffs:read')).toBe(false);
    expect(isWriteScope('certifications:read')).toBe(false);
  });
});

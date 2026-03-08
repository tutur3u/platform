import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: vi.fn(),
}));

import { parseFormIdParam } from './route-utils';

describe('parseFormIdParam', () => {
  it('accepts seeded Postgres UUID values that are not RFC 4122 variants', () => {
    expect(
      parseFormIdParam('50000000-0000-0000-0000-000000000001', 'form ID')
    ).toBe('50000000-0000-0000-0000-000000000001');
  });

  it('accepts standard RFC 4122 UUID values', () => {
    expect(
      parseFormIdParam('a0bba3b1-8861-4f5f-b174-746f75949001', 'form ID')
    ).toBe('a0bba3b1-8861-4f5f-b174-746f75949001');
  });

  it('rejects malformed form IDs', () => {
    expect(() => parseFormIdParam('abc', 'form ID')).toThrow('Invalid form ID');
    expect(() => parseFormIdParam('123', 'form ID')).toThrow('Invalid form ID');
    expect(() =>
      parseFormIdParam('50000000-0000-0000-0000-00000000001', 'form ID')
    ).toThrow('Invalid form ID');
  });
});

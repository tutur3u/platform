import { describe, expect, it } from 'vitest';
import { normalizeWorkspaceMemberList } from './use-bulk-resources';

describe('normalizeWorkspaceMemberList', () => {
  it('preserves valid member arrays', () => {
    const members = [{ id: 'member-1', user_id: 'member-1' }];

    expect(normalizeWorkspaceMemberList(members)).toBe(members);
  });

  it.each([undefined, null, {}, { members: [] }, 'invalid'])(
    'returns an empty array for a non-array cache value',
    (value) => {
      expect(normalizeWorkspaceMemberList(value)).toEqual([]);
    }
  );
});

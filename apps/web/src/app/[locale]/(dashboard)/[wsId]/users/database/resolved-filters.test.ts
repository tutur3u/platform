import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceUsersSearchParams,
  resolveUsersDatabaseFilters,
} from './resolved-filters';

describe('resolveUsersDatabaseFilters', () => {
  it('uses default included groups when included groups are empty and defaults have not been applied yet', () => {
    expect(
      resolveUsersDatabaseFilters({
        includedGroups: [],
        defaultIncludedGroups: ['group-a', 'group-a', 'group-b'],
        hasAppliedDefaultIncludedGroups: false,
      })
    ).toMatchObject({
      includedGroups: ['group-a', 'group-b'],
      excludedGroups: [],
      status: 'active',
      linkStatus: 'all',
      requireAttention: 'all',
      groupMembership: 'all',
    });
  });

  it('uses default excluded groups when included groups are empty and defaults have not been applied yet', () => {
    expect(
      resolveUsersDatabaseFilters({
        q: '  alice  ',
        includedGroups: [],
        excludedGroups: null,
        defaultExcludedGroups: ['group-b', 'group-b', 'group-c'],
        hasAppliedDefaultExcludedGroups: false,
      })
    ).toMatchObject({
      q: 'alice',
      includedGroups: [],
      excludedGroups: ['group-b', 'group-c'],
      status: 'active',
      linkStatus: 'all',
      requireAttention: 'all',
      groupMembership: 'all',
    });
  });

  it('preserves explicit included groups without regressing resolved filters', () => {
    expect(
      resolveUsersDatabaseFilters({
        includedGroups: ['group-a'],
        excludedGroups: ['group-c'],
        defaultExcludedGroups: ['group-b'],
        status: 'archived',
        linkStatus: 'linked',
        requireAttention: 'true',
        groupMembership: 'exactly-one',
      })
    ).toMatchObject({
      includedGroups: ['group-a'],
      excludedGroups: ['group-c'],
      status: 'archived',
      linkStatus: 'linked',
      requireAttention: 'true',
      groupMembership: 'exactly-one',
    });
  });
});

describe('buildWorkspaceUsersSearchParams', () => {
  it('serializes resolved filters including default exclusions and requireAttention', () => {
    const searchParams = buildWorkspaceUsersSearchParams({
      q: 'alice',
      page: 2,
      pageSize: 25,
      includedGroups: [],
      excludedGroups: ['group-b'],
      status: 'active',
      linkStatus: 'virtual',
      requireAttention: 'false',
      groupMembership: 'none',
      withPromotions: true,
    });

    expect(searchParams.get('q')).toBe('alice');
    expect(searchParams.get('page')).toBe('2');
    expect(searchParams.get('pageSize')).toBe('25');
    expect(searchParams.get('status')).toBe('active');
    expect(searchParams.get('linkStatus')).toBe('virtual');
    expect(searchParams.get('requireAttention')).toBe('false');
    expect(searchParams.get('groupMembership')).toBe('none');
    expect(searchParams.getAll('excludedGroups')).toEqual(['group-b']);
    expect(searchParams.get('withPromotions')).toBe('true');
  });
});

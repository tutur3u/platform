import { describe, expect, it } from 'vitest';
import {
  buildCanonicalPostsSearchParams,
  buildPostsSearchParams,
  normalizePostReviewStages,
  shouldApplyDefaultPostStageFilter,
} from './search-params';

describe('posts search params helpers', () => {
  it('injects the default stage filter when no stage or legacy status filters are present', () => {
    const params = new URLSearchParams(
      buildCanonicalPostsSearchParams({ page: '2' }) ?? ''
    );

    expect(params.get('page')).toBe('2');
    expect(params.getAll('stage')).toEqual([
      'missing_check',
      'pending_approval',
    ]);
    expect(shouldApplyDefaultPostStageFilter({ page: '2' })).toBe(true);
  });

  it('does not inject the default stage filter when approval or queue filters are present', () => {
    expect(
      buildCanonicalPostsSearchParams({
        approvalStatus: 'APPROVED',
      })
    ).toBeNull();
    expect(
      buildCanonicalPostsSearchParams({
        queueStatus: 'queued',
      })
    ).toBeNull();
  });

  it('preserves multi-value stages and group filters when building URL params', () => {
    const params = buildPostsSearchParams({
      excludedGroups: ['group-b'],
      includedGroups: ['group-a'],
      page: '3',
      stage: ['missing_check', 'pending_approval'],
      userId: 'user-1',
    });

    expect(params.getAll('stage')).toEqual([
      'missing_check',
      'pending_approval',
    ]);
    expect(params.getAll('includedGroups')).toEqual(['group-a']);
    expect(params.getAll('excludedGroups')).toEqual(['group-b']);
    expect(params.get('page')).toBe('3');
    expect(params.get('userId')).toBe('user-1');
  });

  it('drops unknown stage values during normalization', () => {
    expect(
      normalizePostReviewStages(['missing_check', 'unknown', 'queued'])
    ).toEqual(['missing_check', 'queued']);
  });
});

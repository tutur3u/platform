import { describe, expect, it } from 'vitest';
import {
  buildPostsSearchParamsFromRaw,
  normalizeRawPostReviewStage,
  shouldApplyDefaultPostStageFilter,
} from './search-params';
import { buildCanonicalPostsSearchParams } from './search-params.server';

describe('posts search params helpers', () => {
  it('injects the default stage filter when no stage or legacy status filters are present', () => {
    const params = new URLSearchParams(
      buildCanonicalPostsSearchParams(
        { page: '2' },
        {
          approvalStatus: null,
          cursor: null,
          excludedGroups: [],
          includedGroups: [],
          page: 2,
          pageSize: 10,
          queueStatus: null,
          stage: null,
          userId: null,
        }
      ) ?? ''
    );

    expect(params.get('page')).toBe('2');
    expect(params.get('stage')).toBe('pending_approval');
    expect(
      shouldApplyDefaultPostStageFilter({
        approvalStatus: null,
        queueStatus: null,
        stage: null,
      })
    ).toBe(true);
  });

  it('does not inject the default stage filter when approval or queue filters are present', () => {
    expect(
      buildCanonicalPostsSearchParams({
        approvalStatus: 'APPROVED',
      }, {
        approvalStatus: 'APPROVED',
        cursor: null,
        excludedGroups: [],
        includedGroups: [],
        page: 1,
        pageSize: 10,
        queueStatus: null,
        stage: null,
        userId: null,
      })
    ).toBeNull();
    expect(
      buildCanonicalPostsSearchParams({
        queueStatus: 'queued',
      })
      , {
        approvalStatus: null,
        cursor: null,
        excludedGroups: [],
        includedGroups: [],
        page: 1,
        pageSize: 10,
        queueStatus: 'queued',
        stage: null,
        userId: null,
      })
    ).toBeNull();
  });

  it('canonicalizes multi-value stages down to the first valid value', () => {
    const params = buildPostsSearchParamsFromRaw({
      excludedGroups: ['group-b'],
      includedGroups: ['group-a'],
      page: '3',
      stage: ['missing_check', 'pending_approval'],
      userId: 'user-1',
    });

    expect(params.getAll('stage')).toEqual(['missing_check']);
    expect(params.getAll('includedGroups')).toEqual(['group-a']);
    expect(params.getAll('excludedGroups')).toEqual(['group-b']);
    expect(params.get('page')).toBe('3');
    expect(params.get('userId')).toBe('user-1');

    const canonical = new URLSearchParams(
      buildCanonicalPostsSearchParams(
        {
          excludedGroups: ['group-b'],
          includedGroups: ['group-a'],
          page: '3',
          stage: ['missing_check', 'pending_approval'],
          userId: 'user-1',
        },
        {
          approvalStatus: null,
          cursor: null,
          excludedGroups: ['group-b'],
          includedGroups: ['group-a'],
          page: 3,
          pageSize: 10,
          queueStatus: null,
          stage: null,
          userId: 'user-1',
        }
      ) ?? ''
    );

    expect(canonical.get('stage')).toBe('missing_check');
  });

  it('drops unknown stage values during normalization', () => {
    expect(normalizeRawPostReviewStage(['unknown', 'queued'])).toBe('queued');
    expect(normalizeRawPostReviewStage(['unknown'])).toBeNull();
  });
});

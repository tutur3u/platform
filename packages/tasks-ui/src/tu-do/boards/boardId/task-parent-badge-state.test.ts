import { describe, expect, it } from 'vitest';
import { getTaskCardParentBadgeState } from './task-parent-badge-state';

describe('getTaskCardParentBadgeState', () => {
  it('prefers the resolved parent title when it matches the summary parent id', () => {
    expect(
      getTaskCardParentBadgeState({
        summaryParentTaskId: 'task-parent',
        summaryParentTask: { id: 'task-parent', name: 'Parent from summary' },
        parentTask: { id: 'task-parent', name: 'Parent from fetch' },
        resolvedParentTask: { id: 'task-parent', name: 'Parent from cache' },
        hasLoadedRelationships: true,
      })
    ).toEqual({
      hasParentRelationship: true,
      parentBadgeTask: { id: 'task-parent', name: 'Parent from cache' },
    });
  });

  it('keeps showing that a parent exists when the summary says so, even if the latest fetch is empty', () => {
    expect(
      getTaskCardParentBadgeState({
        summaryParentTaskId: 'task-parent',
        summaryParentTask: null,
        parentTask: null,
        resolvedParentTask: null,
        hasLoadedRelationships: true,
      })
    ).toEqual({
      hasParentRelationship: true,
      parentBadgeTask: null,
    });
  });

  it('clears the parent state when neither summary nor loaded relationships report a parent', () => {
    expect(
      getTaskCardParentBadgeState({
        summaryParentTaskId: null,
        summaryParentTask: null,
        parentTask: null,
        resolvedParentTask: null,
        hasLoadedRelationships: true,
      })
    ).toEqual({
      hasParentRelationship: false,
      parentBadgeTask: null,
    });
  });

  it('uses the summary parent title when relationships have not been expanded yet', () => {
    expect(
      getTaskCardParentBadgeState({
        summaryParentTaskId: 'task-parent',
        summaryParentTask: { id: 'task-parent', name: 'Hehe' },
        parentTask: null,
        resolvedParentTask: null,
        hasLoadedRelationships: false,
      })
    ).toEqual({
      hasParentRelationship: true,
      parentBadgeTask: { id: 'task-parent', name: 'Hehe' },
    });
  });
});

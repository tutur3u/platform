import { describe, expect, it } from 'vitest';
import {
  getPersonalPlacementTargetBoardId,
  shouldPersistTaskDropDirectly,
} from './task-drag-persistence';

describe('task drop persistence strategy', () => {
  it('reconciles every mixed ordering key when an external drag finds a dense gap', () => {
    expect(shouldPersistTaskDropDirectly(true, 3, false)).toBe(false);
  });

  it('uses the direct personal-placement path when no reconciliation is needed', () => {
    expect(shouldPersistTaskDropDirectly(true, 0, false)).toBe(true);
  });
});

describe('getPersonalPlacementTargetBoardId', () => {
  const columns = [{ board_id: 'canonical-board', id: 'target-list' }];

  it('uses the target list board id for real-list moves', () => {
    expect(
      getPersonalPlacementTargetBoardId({
        boardId: 'fallback-board',
        columns,
        targetListId: 'target-list',
      })
    ).toBe('canonical-board');
  });

  it('keeps staging board ids from virtual staging lanes', () => {
    expect(
      getPersonalPlacementTargetBoardId({
        boardId: 'fallback-board',
        columns,
        targetListId: 'personal-external-staging:staging-board',
      })
    ).toBe('staging-board');
  });

  it('falls back to the current board id when list metadata is absent', () => {
    expect(
      getPersonalPlacementTargetBoardId({
        boardId: 'fallback-board',
        columns,
        targetListId: 'missing-list',
      })
    ).toBe('fallback-board');
  });
});

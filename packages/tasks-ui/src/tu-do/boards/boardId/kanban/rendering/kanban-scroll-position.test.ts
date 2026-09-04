import { beforeEach, describe, expect, it } from 'vitest';
import {
  getKanbanScrollStorageKey,
  readKanbanScrollPosition,
  saveKanbanScrollPosition,
} from './kanban-scroll-position';

describe('Kanban scroll position storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips a board-scoped horizontal position', () => {
    saveKanbanScrollPosition('board-1', 1064.5);
    expect(readKanbanScrollPosition('board-1')).toBe(1064.5);
    expect(readKanbanScrollPosition('board-2')).toBeNull();
  });

  it('ignores corrupt and negative positions', () => {
    window.localStorage.setItem(getKanbanScrollStorageKey('board-1'), 'oops');
    window.localStorage.setItem(getKanbanScrollStorageKey('board-2'), '-20');
    expect(readKanbanScrollPosition('board-1')).toBeNull();
    expect(readKanbanScrollPosition('board-2')).toBeNull();
  });
});

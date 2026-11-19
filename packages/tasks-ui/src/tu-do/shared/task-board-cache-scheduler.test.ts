/**
 * @vitest-environment jsdom
 */

import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTaskBoardCache } from './task-board-cache';
import {
  flushTaskBoardCacheWrite,
  flushTaskBoardCacheWrites,
  scheduleTaskBoardCacheWrite,
  TASK_BOARD_CACHE_WRITE_DELAY_MS,
} from './task-board-cache-scheduler';

const board = { id: 'board-1', name: 'Board' } as WorkspaceTaskBoard;
const tasks = (ids: string[]) =>
  ids.map(
    (id) =>
      ({
        id,
        name: id,
        list_id: 'l',
        display_number: 1,
        created_at: '',
      }) as Task
  );

describe('scheduleTaskBoardCacheWrite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    flushTaskBoardCacheWrites();
    vi.useRealTimers();
  });

  it('coalesces rapid snapshots into one write of the latest', () => {
    for (let i = 1; i <= 5; i += 1) {
      scheduleTaskBoardCacheWrite('ws-1', 'board-1', {
        board,
        pagination: {},
        tasks: tasks(Array.from({ length: i }, (_, n) => `t${n}`)),
      });
    }
    expect(readTaskBoardCache('ws-1', 'board-1')).toBeNull();

    vi.advanceTimersByTime(TASK_BOARD_CACHE_WRITE_DELAY_MS - 1);
    expect(readTaskBoardCache('ws-1', 'board-1')).toBeNull();

    vi.advanceTimersByTime(1);
    expect(readTaskBoardCache('ws-1', 'board-1')?.tasks).toHaveLength(5);
  });

  it('flushes a pending snapshot on demand and on page hide', () => {
    scheduleTaskBoardCacheWrite('ws-1', 'board-1', {
      board,
      pagination: {},
      tasks: tasks(['a']),
    });
    flushTaskBoardCacheWrite('ws-1', 'board-1');
    expect(readTaskBoardCache('ws-1', 'board-1')?.tasks).toHaveLength(1);

    scheduleTaskBoardCacheWrite('ws-1', 'board-1', {
      board,
      pagination: {},
      tasks: tasks(['a', 'b']),
    });
    window.dispatchEvent(new Event('pagehide'));
    expect(readTaskBoardCache('ws-1', 'board-1')?.tasks).toHaveLength(2);
  });
});

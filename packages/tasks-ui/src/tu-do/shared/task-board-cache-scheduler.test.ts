/**
 * @vitest-environment jsdom
 */

import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announceSessionEnding } from '@tuturuuu/utils/session-events';
import {
  purgeOtherUserTaskBoardCaches,
  readTaskBoardCache,
  writeTaskBoardCache,
} from './task-board-cache';
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

  it('drops pending snapshots and stored caches when the session ends', () => {
    scheduleTaskBoardCacheWrite('user-a:ws-1', 'board-1', {
      board,
      pagination: {},
      tasks: tasks(['a']),
    });
    flushTaskBoardCacheWrite('user-a:ws-1', 'board-1');
    scheduleTaskBoardCacheWrite('user-a:ws-1', 'board-1', {
      board,
      pagination: {},
      tasks: tasks(['a', 'b']),
    });

    announceSessionEnding();
    window.dispatchEvent(new Event('pagehide'));
    vi.advanceTimersByTime(TASK_BOARD_CACHE_WRITE_DELAY_MS);

    expect(readTaskBoardCache('user-a:ws-1', 'board-1')).toBeNull();
  });
});

describe('purgeOtherUserTaskBoardCaches', () => {
  it("keeps only the signed-in user's board snapshots", () => {
    writeTaskBoardCache('user-a:ws-1', 'board-1', {
      board,
      pagination: {},
      tasks: tasks(['a']),
    });
    writeTaskBoardCache('user-b:ws-1', 'board-1', {
      board,
      pagination: {},
      tasks: tasks(['b']),
    });

    purgeOtherUserTaskBoardCaches('user-b');

    expect(readTaskBoardCache('user-a:ws-1', 'board-1')).toBeNull();
    expect(readTaskBoardCache('user-b:ws-1', 'board-1')?.tasks).toHaveLength(1);
    localStorage.clear();
  });
});

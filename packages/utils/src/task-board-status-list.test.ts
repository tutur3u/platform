import { describe, expect, it } from 'vitest';
import {
  resolveStatusList,
  type StatusListCandidate,
} from './task-board-status-list';

const list = (
  id: string,
  name: string,
  status: string,
  position: number | null,
  extra: Partial<StatusListCandidate> = {}
): StatusListCandidate => ({ id, name, status, position, ...extra });

// The Fleet board: no board defaults, two parking lists next to the queue.
const FLEET = [
  list('waiting', 'Waiting on USER', 'not_started', 5),
  list('queued', 'Queued', 'not_started', 0),
  list('knowledge', 'Fleet Knowledge', 'not_started', 6),
  list('live', 'Live Today', 'active', 1),
  list('review', 'Needs User / Review', 'review', 2),
  list('done', 'Done', 'done', 3),
  list('archived', 'Archived / Closed', 'closed', 4),
];

describe('resolveStatusList', () => {
  it('resolves every status on a board without defaults', () => {
    expect(resolveStatusList(FLEET, 'todo')?.id).toBe('queued');
    expect(resolveStatusList(FLEET, 'backlog')?.id).toBe('queued');
    expect(resolveStatusList(FLEET, 'in-progress')?.id).toBe('live');
    expect(resolveStatusList(FLEET, 'review')?.id).toBe('review');
    expect(resolveStatusList(FLEET, 'done')?.id).toBe('done');
    expect(resolveStatusList(FLEET, 'cancelled')?.id).toBe('archived');
  });

  it('never lands todo on a parking list while a normal one exists', () => {
    const lists = [
      list('waiting', 'Waiting on USER', 'not_started', 0),
      list('queued', 'Queued', 'not_started', 3),
    ];
    expect(resolveStatusList(lists, 'todo')?.id).toBe('queued');
  });

  it('falls back to the lowest-position list when only parking lists remain', () => {
    const lists = [
      list('knowledge', 'Fleet Knowledge', 'not_started', 4),
      list('waiting', 'Waiting on USER', 'not_started', 2),
    ];
    expect(resolveStatusList(lists, 'todo')?.id).toBe('waiting');
  });

  it('prefers a backlog-named list for backlog and excludes it from todo', () => {
    const lists = [
      list('todo', 'To do', 'not_started', 0),
      list('backlog', 'Product Backlog', 'not_started', 1),
    ];
    expect(resolveStatusList(lists, 'backlog')?.id).toBe('backlog');
    expect(resolveStatusList(lists, 'todo')?.id).toBe('todo');
  });

  it('honours the board defaults for done and cancelled when they exist', () => {
    const lists = [
      list('done-a', 'Done A', 'done', 0),
      list('done-b', 'Done B', 'done', 1),
      list('closed-a', 'Closed A', 'closed', 2),
      list('closed-b', 'Closed B', 'closed', 3),
    ];
    const defaults = {
      default_done_list_id: 'done-b',
      default_closed_list_id: 'closed-b',
    };
    expect(resolveStatusList(lists, 'done', defaults)?.id).toBe('done-b');
    expect(resolveStatusList(lists, 'cancelled', defaults)?.id).toBe(
      'closed-b'
    );
  });

  it('ignores a default that points off the board or at a removed list', () => {
    const lists = [
      list('done-a', 'Done A', 'done', 1),
      list('done-b', 'Done B', 'done', 0, { archived: true }),
    ];
    expect(
      resolveStatusList(lists, 'done', { default_done_list_id: 'done-b' })?.id
    ).toBe('done-a');
    expect(
      resolveStatusList(lists, 'done', { default_done_list_id: 'elsewhere' })
        ?.id
    ).toBe('done-a');
  });

  it('skips deleted and archived lists and returns null when none match', () => {
    const lists = [list('gone', 'Active', 'active', 0, { deleted: true })];
    expect(resolveStatusList(lists, 'in-progress')).toBeNull();
    expect(resolveStatusList([], 'review')).toBeNull();
  });
});

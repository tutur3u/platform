import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import { describe, expect, it } from 'vitest';
import { getSprintMoveOptions, NEW_SPRINT } from './sprint-move-items';

const sprint = (n: number, status: BoardSprint['status']) =>
  ({ id: `s${n}`, sequence_number: n, status }) as BoardSprint;

const running = sprint(2, 'active');
const next = sprint(3, 'planned');
const later = sprint(4, 'planned');
const moves = (current: BoardSprint | null, open: BoardSprint[]) =>
  getSprintMoveOptions(open, current).map(({ key, target }) => [
    key,
    target === NEW_SPRINT ? NEW_SPRINT : (target?.id ?? null),
  ]);

describe('getSprintMoveOptions', () => {
  it('moves a task on to the sprint after its own, or out of it', () => {
    expect(moves(running, [later, next, running])).toEqual([
      ['move_to_next_sprint', 's3'],
      ['remove_from_sprint', null],
    ]);
  });

  it('adds the next sprint for a task in the last one, up to the limit', () => {
    expect(moves(later, [running, next, later])).toEqual([
      ['move_to_next_sprint', NEW_SPRINT],
      ['remove_from_sprint', null],
    ]);
    const full = [
      running,
      next,
      later,
      sprint(5, 'planned'),
      sprint(6, 'planned'),
    ];
    expect(moves(full[4]!, full)).toEqual([['remove_from_sprint', null]]);
  });

  it('adds a task outside every sprint to the running sprint or the next', () => {
    expect(moves(null, [running, next])).toEqual([
      ['add_to_current_sprint', 's2'],
      ['move_to_next_sprint', 's3'],
    ]);
    expect(moves(null, [next, later])).toEqual([['move_to_next_sprint', 's3']]);
  });
});

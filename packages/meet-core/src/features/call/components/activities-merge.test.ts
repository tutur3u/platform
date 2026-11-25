import { describe, expect, it } from 'vitest';
import { activityGroup } from './activities-catalog';
import { mergeActivityTiles } from './activities-merge';
import type { ActivityTile } from './activities-pages';

const icon = () => null;
const mergedIcon = () => null;
const copy = {
  whiteboard: { label: 'Whiteboard', description: 'Draw', icon: mergedIcon },
  timer: { label: 'Class timer', description: 'Count', icon: mergedIcon },
};
const tile = (id: string, stageId?: string): ActivityTile => ({
  id,
  stageId,
  label: id,
  icon,
  active: false,
  open: () => undefined,
});
const programming = tile('programming', 'programming');
const board = tile('board', 'board');
const pen = tile('pen-whiteboard', 'tool:pen-whiteboard');
const classroom = tile('whiteboard', 'whiteboard');
const polls = tile('polls', 'tool:polls');
const timers = tile('timers', 'tool:timers');
const roomTimer: ActivityTile = {
  ...tile('class-timer'),
  open: undefined,
  page: () => null,
};

describe('mergeActivityTiles', () => {
  it('lists one Whiteboard that opens the Tuturuuu Whiteboard', () => {
    const merged = mergeActivityTiles(
      [programming, board, polls, pen, classroom],
      copy
    );
    expect(merged.map((entry) => entry.id)).toEqual([
      'programming',
      'whiteboard',
      'polls',
    ]);
    expect(merged[1]).toMatchObject({
      label: 'Whiteboard',
      description: 'Draw',
      stageId: 'board',
      open: board.open,
    });
  });

  it('falls back to the pen board, then the classroom whiteboard', () => {
    expect(mergeActivityTiles([pen, classroom], copy)).toEqual([
      expect.objectContaining({ id: 'whiteboard', stageId: pen.stageId }),
    ]);
    expect(mergeActivityTiles([classroom], copy)).toEqual([
      expect.objectContaining({ id: 'whiteboard', stageId: 'whiteboard' }),
    ]);
  });

  it('opens the pen board first while a guest could not open the board', () => {
    const merged = mergeActivityTiles([board, pen, classroom], copy, {
      penBoardFirst: true,
    });
    expect(merged).toEqual([
      expect.objectContaining({ id: 'whiteboard', stageId: pen.stageId }),
    ]);
    // Without the pen board or the classroom board, the board still opens.
    expect(
      mergeActivityTiles([board], copy, { penBoardFirst: true })[0]
    ).toMatchObject({ stageId: 'board' });
  });

  it('lists one Class timer: the pane when it is offered, else the room page', () => {
    const both = mergeActivityTiles([timers, polls, roomTimer], copy);
    expect(both.map((entry) => entry.id)).toEqual(['timer', 'polls']);
    expect(both[0]).toMatchObject({ label: 'Class timer', stageId: 'tool:timers' });
    expect(both[0]?.page).toBeUndefined();
    const page = mergeActivityTiles([polls, roomTimer], copy);
    expect(page[1]).toMatchObject({ id: 'timer', page: roomTimer.page });
  });

  it('keeps the merged entries in the groups of their purpose', () => {
    expect(activityGroup('whiteboard')).toBe('create');
    expect(activityGroup('timer')).toBe('run');
  });

  it('changes nothing without older entries', () => {
    const tiles = [programming, polls];
    expect(mergeActivityTiles(tiles, copy)).toEqual(tiles);
  });
});

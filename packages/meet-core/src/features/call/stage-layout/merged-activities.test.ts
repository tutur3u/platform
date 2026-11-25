import { describe, expect, it } from 'vitest';
import { BOARD_ACTIVITY, toolActivityId } from './activity-ids';
import { MERGED_ACTIVITY_IDS, mergedKindOf } from './merged-activities';

describe('merged activities', () => {
  it('maps every older whiteboard and timer id to its merged kind', () => {
    expect({
      board: mergedKindOf(BOARD_ACTIVITY),
      pen: mergedKindOf(toolActivityId('pen-whiteboard')),
      classroom: mergedKindOf('whiteboard'),
      personal: mergedKindOf(toolActivityId('timers')),
      room: mergedKindOf('class-timer'),
    }).toEqual({
      board: 'whiteboard',
      pen: 'whiteboard',
      classroom: 'whiteboard',
      personal: 'timer',
      room: 'timer',
    });
  });

  it('leaves every other activity alone', () => {
    for (const id of [
      'programming',
      'document',
      'breakouts',
      toolActivityId('polls'),
      'pen-whiteboard',
      'timers',
      null,
      undefined,
    ])
      expect(mergedKindOf(id)).toBeNull();
  });

  it('prefers the Tuturuuu Whiteboard, then the pen board', () => {
    expect(MERGED_ACTIVITY_IDS.whiteboard).toEqual([
      'board',
      'tool:pen-whiteboard',
      'whiteboard',
    ]);
    expect(MERGED_ACTIVITY_IDS.timer).toEqual(['tool:timers', 'class-timer']);
  });
});

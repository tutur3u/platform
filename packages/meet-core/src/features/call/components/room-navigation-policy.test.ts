import { describe, expect, it } from 'vitest';
import {
  canOpenRoomView,
  currentRoomView,
  decideNavigation,
  FOLLOW_UPDATE_GAP_MS,
  followUpdateDelay,
  type NavigationEvent,
  sameRoomView,
  surfaceFromView,
  targetCount,
  unseenNavigation,
} from './room-navigation-policy';

const event = (patch: Partial<NavigationEvent>): NavigationEvent => ({
  id: 'e1',
  mode: 'summon',
  from: 'leader',
  view: { surface: 'programming' },
  forced: false,
  ...patch,
});
const open = () => true;
const context = {
  selfUserId: 'me',
  following: null as string | null,
  canOpen: open,
};

describe('room views', () => {
  it('maps the open surface, collaboration before tool drawers', () => {
    expect(
      currentRoomView({
        programming: true,
        document: false,
        drawer: 'tool:polls',
      })
    ).toEqual({ surface: 'programming' });
    expect(
      currentRoomView({ programming: false, document: true, drawer: null })
    ).toEqual({ surface: 'document' });
    expect(
      currentRoomView({
        programming: false,
        document: false,
        drawer: 'tool:quiz',
      })
    ).toEqual({ surface: 'tool', toolId: 'quiz' });
    expect(
      currentRoomView({ programming: false, document: false, drawer: 'chat' })
    ).toEqual({ surface: 'stage' });
  });

  it('round-trips a view and keeps non-surface drawers', () => {
    expect(surfaceFromView({ surface: 'document' }, 'chat')).toEqual({
      programming: false,
      document: true,
      drawer: 'chat',
    });
    expect(surfaceFromView({ surface: 'stage' }, 'tool:polls')).toEqual({
      programming: false,
      document: false,
      drawer: null,
    });
    const tool = surfaceFromView(
      { surface: 'tool', toolId: 'live-qa' },
      'chat'
    );
    expect(currentRoomView(tool)).toEqual({
      surface: 'tool',
      toolId: 'live-qa',
    });
    expect(
      sameRoomView(
        { surface: 'tool', toolId: 'a' },
        { surface: 'tool', toolId: 'b' }
      )
    ).toBe(false);
    expect(sameRoomView({ surface: 'stage' }, { surface: 'stage' })).toBe(true);
  });

  it('gates collaboration on the room activity policy', () => {
    const attendee = { collaboration: false, tools: true };
    expect(canOpenRoomView({ surface: 'programming' }, attendee)).toBe(false);
    expect(canOpenRoomView({ surface: 'document' }, attendee)).toBe(false);
    expect(
      canOpenRoomView({ surface: 'tool', toolId: 'polls' }, attendee)
    ).toBe(true);
    expect(
      canOpenRoomView(
        { surface: 'stage' },
        { collaboration: false, tools: false }
      )
    ).toBe(true);
  });
});

describe('decideNavigation', () => {
  it('moves people for hosts and invites them otherwise', () => {
    expect(decideNavigation(event({ forced: true }), context)).toEqual({
      kind: 'navigate',
      view: { surface: 'programming' },
    });
    expect(decideNavigation(event({}), context)).toEqual({
      kind: 'invite',
      view: { surface: 'programming' },
    });
  });

  it('explains a summon this person cannot open instead of moving them', () => {
    expect(
      decideNavigation(event({ forced: true }), {
        ...context,
        canOpen: () => false,
      })
    ).toEqual({ kind: 'blocked', view: { surface: 'programming' } });
  });

  it('ignores its own echoes and summons without a view', () => {
    expect(decideNavigation(event({ from: 'me' }), context)).toEqual({
      kind: 'ignore',
    });
    expect(decideNavigation(event({ view: undefined }), context)).toEqual({
      kind: 'ignore',
    });
  });

  it('runs the follow lifecycle against the current leader only', () => {
    expect(
      decideNavigation(event({ mode: 'follow', forced: true }), context)
    ).toEqual({
      kind: 'follow-start',
      leaderId: 'leader',
      view: { surface: 'programming' },
    });
    expect(decideNavigation(event({ mode: 'follow' }), context)).toMatchObject({
      kind: 'follow-invite',
    });
    const following = { ...context, following: 'leader' };
    expect(decideNavigation(event({ mode: 'follow' }), following)).toEqual({
      kind: 'ignore',
    });
    expect(
      decideNavigation(
        event({ mode: 'follow.update', view: { surface: 'document' } }),
        following
      )
    ).toEqual({ kind: 'follow-apply', view: { surface: 'document' } });
    expect(
      decideNavigation(
        event({ mode: 'follow.update', from: 'other' }),
        following
      )
    ).toEqual({ kind: 'ignore' });
    expect(decideNavigation(event({ mode: 'follow.update' }), context)).toEqual(
      {
        kind: 'ignore',
      }
    );
    expect(decideNavigation(event({ mode: 'follow.stop' }), following)).toEqual(
      {
        kind: 'follow-end',
        leaderId: 'leader',
      }
    );
    expect(decideNavigation(event({ mode: 'follow.stop' }), context)).toEqual({
      kind: 'follow-withdrawn',
      leaderId: 'leader',
    });
  });

  it('skips updates the follower cannot open', () => {
    expect(
      decideNavigation(event({ mode: 'follow.update' }), {
        ...context,
        following: 'leader',
        canOpen: () => false,
      })
    ).toEqual({ kind: 'ignore' });
  });
});

describe('event bookkeeping', () => {
  it('handles each event id once, in order', () => {
    const seen = new Set<string>();
    const first = [{ id: 'a' }, { id: 'b' }];
    expect(unseenNavigation(first, seen).map((e) => e.id)).toEqual(['a', 'b']);
    expect(
      unseenNavigation([...first, { id: 'c' }], seen).map((e) => e.id)
    ).toEqual(['c']);
    expect(unseenNavigation(undefined, seen)).toEqual([]);
  });

  it('spaces follow updates and never drops the last one', () => {
    expect(followUpdateDelay(0, 10_000)).toBe(0);
    expect(followUpdateDelay(10_000, 10_100)).toBe(FOLLOW_UPDATE_GAP_MS - 100);
    expect(followUpdateDelay(10_000, 10_000 + FOLLOW_UPDATE_GAP_MS)).toBe(0);
  });

  it('counts targets against people present now', () => {
    expect(targetCount('everyone', ['a', 'b'])).toBe(2);
    expect(targetCount(['a', 'gone'], ['a', 'b'])).toBe(1);
    expect(targetCount([], ['a'])).toBe(0);
  });
});

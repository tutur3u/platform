import { describe, expect, it } from 'vitest';
import { meetRealtimeClientMessageSchema } from './messages';
import { getMeetRealtimeScopesForRole } from './permissions';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import { createMeetPresence, createMeetRoomSnapshot } from './room';
import { applyRoomNavigation } from './room-navigation';
import {
  MEET_STAGE_LAYOUT_MAX_BYTES,
  type MeetStageLayoutSnapshot,
  meetStageLayoutSnapshotSchema,
} from './stage-layout-snapshot';

const pane = (id: string, tabs: string[]) => ({
  kind: 'pane' as const,
  id,
  tabs,
  active: tabs[0] as string,
});

const threePanes: MeetStageLayoutSnapshot = {
  root: {
    kind: 'split',
    id: 's4',
    axis: 'row',
    children: [
      pane('p1', ['programming', 'document']),
      {
        kind: 'split',
        id: 's5',
        axis: 'column',
        children: [pane('p2', ['tool:live-qa']), pane('p3', ['whiteboard'])],
        sizes: [50, 50],
      },
    ],
    sizes: [60, 40],
  },
  focusedPaneId: 'p2',
  maximizedPaneId: null,
};

const valid = (value: unknown) =>
  meetStageLayoutSnapshotSchema.safeParse(value).success;

describe('stage layout snapshot', () => {
  it('accepts a full three-pane arrangement and an empty stage', () => {
    expect(valid(threePanes)).toBe(true);
    expect(
      valid({ root: null, focusedPaneId: null, maximizedPaneId: null })
    ).toBe(true);
  });

  it('refuses more panes, tabs or bytes than the stage keeps', () => {
    expect(
      valid({
        ...threePanes,
        root: {
          kind: 'split',
          id: 's1',
          axis: 'row',
          children: [
            pane('p1', ['a']),
            pane('p2', ['b']),
            pane('p3', ['c']),
            pane('p4', ['d']),
          ],
          sizes: [25, 25, 25, 25],
        },
      })
    ).toBe(false);
    const tabs = Array.from({ length: 25 }, (_, index) => `tool:t${index}`);
    expect(valid({ ...threePanes, root: pane('p1', tabs) })).toBe(false);
    const long = Array.from(
      { length: 24 },
      (_, index) => `tool:${String(index).padStart(43, 'x')}`
    );
    const wide = {
      ...threePanes,
      root: {
        kind: 'split',
        id: 's1',
        axis: 'row',
        children: [pane('p1', long.slice(0, 12)), pane('p2', long.slice(12))],
        sizes: [50, 50],
      },
    };
    expect(JSON.stringify(wide).length).toBeLessThan(
      MEET_STAGE_LAYOUT_MAX_BYTES
    );
    expect(valid(wide)).toBe(true);
  });

  it('refuses malformed ids, sizes and nodes', () => {
    expect(valid({ ...threePanes, focusedPaneId: 'pane-1' })).toBe(false);
    expect(valid({ ...threePanes, root: pane('p1', ['<script>']) })).toBe(
      false
    );
    expect(
      valid({
        ...threePanes,
        root: {
          kind: 'split',
          id: 's1',
          axis: 'row',
          children: [pane('p1', ['a']), pane('p2', ['b'])],
          sizes: [100],
        },
      })
    ).toBe(false);
    // A zero share would fail the stage's own parser and blank the stage.
    expect(
      valid({
        ...threePanes,
        root: {
          kind: 'split',
          id: 's1',
          axis: 'row',
          children: [pane('p1', ['a']), pane('p2', ['b'])],
          sizes: [0, 100],
        },
      })
    ).toBe(false);
  });

  it('rides on follow requests and reaches only followers', () => {
    const hostId = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
    const aliceId = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
    const now = '2026-11-24T02:00:00.000Z';
    const token = (userId: string, role: 'host' | 'speaker') =>
      meetRealtimeTokenPayloadSchema.parse({
        role,
        admission: role === 'host' ? 'open' : 'lobby',
        userId,
        displayName: role,
        avatarUrl: 'https://example.com/avatar.png',
        roomId: 'test',
        meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
        wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
        exp: 2_000_000_000,
        limits: {},
        scopes: getMeetRealtimeScopesForRole(role),
      });
    const host = token(hostId, 'host');
    const state = createMeetRoomSnapshot();
    state.presence[hostId] = createMeetPresence(host, now);
    state.presence[aliceId] = createMeetPresence(
      token(aliceId, 'speaker'),
      now
    );
    const parse = (mode: string) =>
      meetRealtimeClientMessageSchema.parse({
        type: 'navigation.request',
        mode,
        targets: 'everyone',
        view: { surface: 'tool', toolId: 'live-qa' },
        layout: threePanes,
      });

    const follow = applyRoomNavigation(state, parse('follow'), host, now);
    expect(follow?.direct?.[0]?.message).toMatchObject({
      mode: 'follow',
      layout: threePanes,
    });
    // A Summon brings one surface; an arrangement on it is not relayed.
    const summon = applyRoomNavigation(
      state,
      parse('summon'),
      host,
      '2026-11-24T02:00:05.000Z'
    );
    expect(summon?.direct?.[0]?.message).not.toHaveProperty('layout');
  });
});

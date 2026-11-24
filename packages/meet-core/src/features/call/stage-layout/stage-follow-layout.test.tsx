// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import type { MeetStageLayoutSnapshot } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import { useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { NavigationEvent } from '../components/room-navigation-policy';
import type { MeetRoomController } from '../lib/room-controller';
import { paneLeaves } from './layout-model';
import { useStageLayout } from './use-stage-layout';
import { useStageNavigation } from './use-stage-navigation';

// The real room-navigation hooks run here; only the room they read is faked.
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), dismiss: vi.fn() }),
}));

type Person = { userId: string; displayName: string };
let people: Record<string, Person> = {};
let selfUserId = 'me';
let role = 'participant';
let events: NavigationEvent[] = [];
let available: (id: string) => boolean = () => true;
let account = true;
let brought = 0;
let stage: ReturnType<typeof useStageLayout>;
let nav: ReturnType<typeof useStageNavigation>;
const requestNavigation = vi.fn();

function Harness() {
  stage = useStageLayout({
    accountId: selfUserId,
    meetingId: 'm',
    isAvailable: available,
    tier: 'desktop',
  });
  const room = useRef({ state: {}, requestNavigation }).current;
  room.state = {
    participants: people,
    selfUserId,
    navigation: events,
    settings: {},
    role,
    canManageParticipants: role === 'host',
    error: null,
  };
  nav = useStageNavigation({
    room: room as unknown as MeetRoomController,
    stage,
    drawer: null,
    onDrawer: () => {},
    onBroughtIn: () => {
      brought += 1;
    },
    access: {
      browse: true,
      account,
      tools: true,
      toolIds: ['live-qa', 'polls'],
    },
  });
  return null;
}

const tree = () => (
  <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
    <Harness />
  </NextIntlClientProvider>
);

const pane = (id: string, tabs: string[], active = tabs[0] as string) => ({
  kind: 'pane' as const,
  id,
  tabs,
  active,
});

/** Co-Programming and Q&A side by side, Q&A in focus. */
const sideBySide: MeetStageLayoutSnapshot = {
  root: {
    kind: 'split',
    id: 's3',
    axis: 'row',
    children: [pane('p1', ['programming']), pane('p2', ['tool:live-qa'])],
    sizes: [60, 40],
  },
  focusedPaneId: 'p2',
  maximizedPaneId: null,
};

function deliver(
  mode: NavigationEvent['mode'],
  layout: MeetStageLayoutSnapshot | undefined,
  { from = 'leader', forced = true } = {}
) {
  const focused = layout
    ? paneLeaves(layout.root).find((entry) => entry.id === layout.focusedPaneId)
        ?.active
    : undefined;
  const view: NavigationEvent['view'] =
    focused === 'programming'
      ? { surface: 'programming' }
      : focused?.startsWith('tool:')
        ? { surface: 'tool', toolId: focused.slice('tool:'.length) }
        : { surface: 'stage' };
  events = [
    ...events,
    { id: `e${events.length + 1}`, mode, from, view, layout, forced },
  ];
}

const splitSizes = () =>
  stage.layout.root?.kind === 'split' ? stage.layout.root.sizes : null;

beforeEach(() => {
  people = {
    leader: { userId: 'leader', displayName: 'Lan' },
    host: { userId: 'host', displayName: 'Hoa' },
    me: { userId: 'me', displayName: 'Minh' },
  };
  selfUserId = 'me';
  role = 'participant';
  events = [];
  available = () => true;
  account = true;
  brought = 0;
  requestNavigation.mockClear();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

it('mirrors the leader’s whole arrangement and its later changes', () => {
  const view = render(tree());
  act(() => stage.open('whiteboard'));
  deliver('follow', sideBySide);
  view.rerender(tree());
  expect(nav.following?.leaderId).toBe('leader');
  // Their own activities give way to the leader's panes, sizes and focus.
  expect(stage.openIds).toEqual(['programming', 'tool:live-qa']);
  expect(stage.focused).toBe('tool:live-qa');
  expect(splitSizes()).toEqual([60, 40]);

  deliver('follow.update', {
    ...sideBySide,
    root: { ...(sideBySide.root as object), sizes: [30, 70] } as never,
    maximizedPaneId: 'p1',
    focusedPaneId: 'p1',
  });
  view.rerender(tree());
  expect(splitSizes()).toEqual([30, 70]);
  expect(stage.layout.maximizedPaneId).toBe('p1');
  expect(stage.focused).toBe('programming');
  expect(nav.following?.leaderId).toBe('leader');
});

it('locks the person’s own rearranging while following', () => {
  const view = render(tree());
  deliver('follow', sideBySide);
  view.rerender(tree());
  expect(stage.locked).toBe(true);
  act(() => {
    stage.open('whiteboard');
    stage.close('programming');
    stage.resize('s3', 0, 20);
    stage.maximize('p1');
    stage.focusPane('p1');
    stage.swapPanes('p1', 'p2');
  });
  view.rerender(tree());
  expect(stage.openIds).toEqual(['programming', 'tool:live-qa']);
  expect(stage.focused).toBe('tool:live-qa');
  expect(splitSizes()).toEqual([60, 40]);
  expect(stage.layout.maximizedPaneId).toBeNull();
  expect(nav.following?.leaderId).toBe('leader');
});

it('unlocks on leaving follow mode and keeps what was on screen', () => {
  const view = render(tree());
  deliver('follow', sideBySide);
  view.rerender(tree());
  act(() => nav.stopFollowing());
  view.rerender(tree());
  expect(nav.following).toBeNull();
  expect(stage.locked).toBe(false);
  expect(stage.openIds).toEqual(['programming', 'tool:live-qa']);
  act(() => stage.resize('s3', 0, 25));
  expect(splitSizes()).toEqual([25, 75]);
  // The former leader's changes no longer reach them.
  deliver('follow.update', {
    root: pane('p1', ['tool:polls']),
    focusedPaneId: 'p1',
    maximizedPaneId: null,
  });
  view.rerender(tree());
  expect(stage.openIds).toEqual(['programming', 'tool:live-qa']);
});

it('switches to a new leader’s arrangement and ignores the old leader', () => {
  const view = render(tree());
  deliver('follow', sideBySide);
  view.rerender(tree());
  const solo: MeetStageLayoutSnapshot = {
    root: pane('p1', ['tool:polls', 'programming'], 'tool:polls'),
    focusedPaneId: 'p1',
    maximizedPaneId: null,
  };
  deliver('follow', solo, { from: 'host' });
  view.rerender(tree());
  expect(nav.following?.leaderId).toBe('host');
  expect(stage.openIds).toEqual(['tool:polls', 'programming']);
  expect(stage.focused).toBe('tool:polls');
  expect(stage.locked).toBe(true);
  deliver('follow.update', sideBySide);
  view.rerender(tree());
  expect(stage.openIds).toEqual(['tool:polls', 'programming']);
});

it('leaves out activities this person cannot open', () => {
  const view = render(tree());
  deliver('follow', sideBySide);
  view.rerender(tree());
  deliver(
    'follow.update',
    {
      root: {
        kind: 'split',
        id: 's3',
        axis: 'row',
        children: [pane('p1', ['tool:secret']), pane('p2', ['tool:live-qa'])],
        sizes: [50, 50],
      },
      focusedPaneId: 'p2',
      maximizedPaneId: null,
    },
    { forced: false }
  );
  view.rerender(tree());
  expect(stage.openIds).toEqual(['tool:live-qa']);
});

it('shares the leader’s arrangement and brings late joiners in with it', () => {
  vi.useFakeTimers();
  selfUserId = 'leader';
  role = 'host';
  people = {
    leader: { userId: 'leader', displayName: 'Lan' },
    me: { userId: 'me', displayName: 'Minh' },
  };
  const view = render(tree());
  act(() => {
    stage.open('programming');
    stage.open('tool:live-qa');
  });
  act(() => nav.startLeading('everyone'));
  expect(requestNavigation).toHaveBeenLastCalledWith(
    expect.objectContaining({
      mode: 'follow',
      targets: 'everyone',
      layout: stage.snapshot,
    })
  );

  // A rearrangement goes out as one paced update with the new layout.
  act(() => stage.resize(stage.layout.root?.id ?? '', 0, 30));
  act(() => vi.advanceTimersByTime(1200));
  expect(requestNavigation).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: 'follow.update', layout: stage.snapshot })
  );
  const sends = requestNavigation.mock.calls.length;

  // Someone joins after leading started: they get a start of their own.
  people = { ...people, late: { userId: 'late', displayName: 'Linh' } };
  view.rerender(tree());
  act(() => vi.advanceTimersByTime(1200));
  expect(requestNavigation.mock.calls.length).toBe(sends + 1);
  expect(requestNavigation).toHaveBeenLastCalledWith({
    mode: 'follow',
    targets: ['late'],
    view: { surface: 'tool', toolId: 'live-qa' },
    layout: stage.snapshot,
  });
});

it('keeps following when access to the mirrored activity arrives a render later', () => {
  // A host's Follow grants the activities it brings; the grant lands after.
  let granted = false;
  available = (id) => id !== 'programming' || granted;
  const view = render(tree());
  deliver('follow', sideBySide);
  view.rerender(tree());
  granted = true;
  available = (id) => id !== 'programming' || granted;
  view.rerender(tree());
  view.rerender(tree());
  expect(nav.following?.leaderId).toBe('leader');
  expect(stage.openIds).toEqual(['programming', 'tool:live-qa']);
});

it('mirrors the panes it may open around a focused one it may not', () => {
  const view = render(tree());
  deliver('follow', sideBySide);
  view.rerender(tree());
  deliver(
    'follow.update',
    {
      root: {
        kind: 'split',
        id: 's3',
        axis: 'row',
        children: [pane('p1', ['tool:polls']), pane('p2', ['tool:secret'])],
        sizes: [50, 50],
      },
      focusedPaneId: 'p2',
      maximizedPaneId: null,
    },
    { forced: false }
  );
  view.rerender(tree());
  expect(stage.openIds).toEqual(['tool:polls']);
  expect(nav.following?.leaderId).toBe('leader');
});

it('leaves the saved whiteboard out for a guest', () => {
  account = false;
  const view = render(tree());
  deliver('follow', {
    root: pane('p1', ['board', 'tool:polls'], 'tool:polls'),
    focusedPaneId: 'p1',
    maximizedPaneId: null,
  });
  view.rerender(tree());
  expect(stage.openIds).toEqual(['tool:polls']);
});

it('leaves follow mode when the person joins someone else’s surface', async () => {
  const { toast } = await import('@tuturuuu/ui/sonner');
  const view = render(tree());
  deliver('follow', sideBySide);
  view.rerender(tree());
  events = [
    ...events,
    {
      id: `e${events.length + 1}`,
      mode: 'summon',
      from: 'host',
      view: { surface: 'tool', toolId: 'polls' },
      forced: false,
    },
  ];
  view.rerender(tree());
  const options = vi.mocked(toast).mock.calls.at(-1)?.[1] as {
    action?: { onClick: () => void };
  };
  act(() => options.action?.onClick());
  view.rerender(tree());
  expect(nav.following).toBeNull();
  expect(stage.locked).toBe(false);
  expect(stage.focused).toBe('tool:polls');
});

it('opens the collaboration surfaces a host’s Follow brings, the whiteboard included', () => {
  const view = render(tree());
  deliver('follow', {
    root: pane('p1', ['board']),
    focusedPaneId: 'p1',
    maximizedPaneId: null,
  });
  view.rerender(tree());
  expect(brought).toBe(1);
  expect(stage.openIds).toEqual(['board']);
});

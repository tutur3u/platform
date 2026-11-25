// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useRef } from 'react';
import { toast } from '@tuturuuu/ui/sonner';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { NavigationEvent } from '../components/room-navigation-policy';
import type { MeetRoomController } from '../lib/room-controller';
import { StageLayoutView } from './stage-layout-view';
import { useActivityPresentation } from './use-activity-presentation';
import { useStageLayout } from './use-stage-layout';
import { useStageNavigation } from './use-stage-navigation';

// The real room-navigation hook runs here; only the room it reads is faked.
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), dismiss: vi.fn() }),
}));

const people = {
  leader: { userId: 'leader', displayName: 'Lan' },
  me: { userId: 'me', displayName: 'Minh' },
};
let events: NavigationEvent[] = [];
let allowed = true;
let sharers: readonly string[] = [];
let presenting: ReturnType<typeof useActivityPresentation>;
const requestNavigation = vi.fn();
let stage: ReturnType<typeof useStageLayout>;
let nav: ReturnType<typeof useStageNavigation>;
let summoned: string[] = [];
let drawerNow: string | null = null;
const onDrawer = vi.fn();

function Harness() {
  stage = useStageLayout({
    accountId: 'me',
    meetingId: 'm',
    isAvailable: () => true,
    tier: 'desktop',
  });
  const room = useRef({
    state: {},
    requestNavigation,
  }).current;
  room.state = {
    participants: people,
    selfUserId: 'me',
    navigation: events,
    settings: { participantNavigation: allowed },
    role: 'participant',
    canManageParticipants: false,
    error: null,
  };
  presenting = useActivityPresentation(stage.openIds.length > 0, sharers);
  nav = useStageNavigation({
    room: room as unknown as MeetRoomController,
    stage,
    drawer: drawerNow,
    onDrawer,
    onBroughtIn: () => {},
    onSummoned: (id) => summoned.push(id),
    onNavigate: presenting.navigate,
    access: {
      browse: true,
      account: true,
      tools: true,
      toolIds: ['live-qa', 'polls'],
    },
  });
  return (
    <StageLayoutView
      controller={stage}
      peopleCount={2}
      presentation={presenting}
      stage={<p>People</p>}
      activities={stage.openIds.map((id) => ({
        id,
        title: id === 'document' ? messages.meet.collaboration.document : id,
        icon: () => null,
        content: <p>{id} activity</p>,
      }))}
    />
  );
}

const tree = () => (
  <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
    <Harness />
  </NextIntlClientProvider>
);
const mount = () => render(tree());
const deliver = (
  view: NavigationEvent['view'],
  mode: NavigationEvent['mode'],
  forced = true
) => {
  events = [
    ...events,
    { id: `e${events.length + 1}`, mode, from: 'leader', view, forced },
  ];
};

beforeEach(() => {
  events = [];
  allowed = true;
  sharers = [];
  requestNavigation.mockClear();
  vi.mocked(toast).mockClear();
  summoned = [];
  drawerNow = null;
  onDrawer.mockClear();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

it('keeps following when a forced Follow from the stage opens nothing', () => {
  const view = mount();
  act(() => {
    stage.open('tool:live-qa');
    stage.open('programming');
  });
  expect(stage.focused).toBe('programming');
  deliver({ surface: 'stage' }, 'follow');
  view.rerender(tree());
  // Following started, and the person is still where they were.
  expect(nav.following?.leaderId).toBe('leader');
  expect(stage.openIds).toEqual(['tool:live-qa', 'programming']);
  expect(stage.focused).toBe('programming');
  // It survives further renders, not only the one that started it.
  view.rerender(tree());
  view.rerender(tree());
  expect(nav.following?.leaderId).toBe('leader');
});

it('follows the leader to an activity after starting from the stage', () => {
  const view = mount();
  act(() => stage.open('programming'));
  deliver({ surface: 'stage' }, 'follow');
  view.rerender(tree());
  deliver({ surface: 'tool', toolId: 'live-qa' }, 'follow.update');
  view.rerender(tree());
  expect(nav.following?.leaderId).toBe('leader');
  expect(stage.focused).toBe('tool:live-qa');
  expect(stage.openIds).toEqual(['programming', 'tool:live-qa']);
  // The tool a host brought them to is theirs for the session.
  expect(summoned).toEqual(['tool:live-qa']);
});

it('keeps the person where the leader is while following', () => {
  const view = mount();
  act(() => {
    stage.open('tool:live-qa');
    stage.open('programming');
  });
  deliver({ surface: 'stage' }, 'follow');
  view.rerender(tree());
  expect(nav.following).not.toBeNull();
  // Their own move waits until they leave follow mode.
  act(() => stage.open('tool:live-qa'));
  view.rerender(tree());
  expect(stage.focused).toBe('programming');
  expect(nav.following).not.toBeNull();
});

const clickToastAction = () => {
  const options = vi.mocked(toast).mock.calls.at(-1)?.[1] as
    | { action?: { onClick: () => void } }
    | undefined;
  act(() => options?.action?.onClick());
};
const summon = (view: NavigationEvent['view'], rerender: () => void) => {
  deliver(view, 'summon');
  rerender();
};

it('goes back from a summon to the stage by closing what was brought in', () => {
  const view = mount();
  summon({ surface: 'tool', toolId: 'live-qa' }, () => view.rerender(tree()));
  expect(stage.openIds).toEqual(['tool:live-qa']);
  clickToastAction();
  expect(stage.openIds).toEqual([]);
});

it('goes back to a classroom board and closes the activity brought in', () => {
  const view = mount();
  act(() => stage.open('whiteboard'));
  summon({ surface: 'tool', toolId: 'live-qa' }, () => view.rerender(tree()));
  expect(stage.focused).toBe('tool:live-qa');
  clickToastAction();
  expect(stage.openIds).toEqual(['whiteboard']);
  expect(stage.focused).toBe('whiteboard');
});

it('goes back to the pane the person was in when the activity was already open', () => {
  const view = mount();
  act(() => {
    stage.open('tool:live-qa');
    stage.open('programming');
  });
  summon({ surface: 'tool', toolId: 'live-qa' }, () => view.rerender(tree()));
  expect(stage.focused).toBe('tool:live-qa');
  clickToastAction();
  // Nothing was newly opened, so nothing closes; focus returns.
  expect(stage.openIds).toEqual(['tool:live-qa', 'programming']);
  expect(stage.focused).toBe('programming');
});

it('does not reopen an activity the person closed after the summon', () => {
  const view = mount();
  act(() => stage.open('whiteboard'));
  summon({ surface: 'tool', toolId: 'live-qa' }, () => view.rerender(tree()));
  act(() => stage.close('whiteboard'));
  clickToastAction();
  expect(stage.openIds).toEqual([]);
});

it('restores the side drawer the person had before the summon', () => {
  drawerNow = 'chat';
  const view = mount();
  summon({ surface: 'tool', toolId: 'live-qa' }, () => view.rerender(tree()));
  // They open another drawer, then change their mind and go back.
  drawerNow = 'participants';
  view.rerender(tree());
  onDrawer.mockClear();
  clickToastAction();
  expect(onDrawer).toHaveBeenCalledWith('chat');
});

it('only closes the brought-in activity once the person has moved on', () => {
  const view = mount();
  act(() => stage.open('whiteboard'));
  summon({ surface: 'tool', toolId: 'live-qa' }, () => view.rerender(tree()));
  // They go to the pen board on their own; the toast is now stale.
  act(() => stage.open('tool:pen-whiteboard'));
  view.rerender(tree());
  onDrawer.mockClear();
  clickToastAction();
  expect(stage.openIds).toEqual(['whiteboard', 'tool:pen-whiteboard']);
  expect(stage.focused).toBe('tool:pen-whiteboard');
  expect(onDrawer).not.toHaveBeenCalled();
});

it('does not send a Summon from a participant when room navigation is disallowed', () => {
  allowed = false;
  mount();
  expect(nav.allowed).toBe(false);
  act(() => nav.summon(['leader'], { surface: 'document' }));
  expect(requestNavigation).not.toHaveBeenCalled();
  expect(nav.paused).toBe(false);
});

it.each(['summon', 'follow'] as const)(
  'restores an automatically minimized layout for an incoming %s',
  (mode) => {
    const view = mount();
    act(() => stage.open('programming'));
    sharers = ['leader'];
    view.rerender(tree());
    expect(presenting.autoMinimized).toBe(true);
    deliver({ surface: 'document' }, mode);
    view.rerender(tree());
    expect(stage.focused).toBe('document');
    expect(presenting.minimized).toBe(false);
  }
);

it('keeps activities minimized when summoned to the people view or going back', () => {
  const { rerender } = mount();
  act(() => stage.open('document'));
  sharers = ['leader'];
  rerender(tree());
  expect(presenting.autoMinimized).toBe(true);

  deliver({ surface: 'stage' }, 'summon');
  rerender(tree());
  expect(presenting.autoMinimized).toBe(true);

  clickToastAction();
  expect(presenting.autoMinimized).toBe(true);
  expect(stage.focused).toBe('document');
});

it('restores a manually minimized activity for a forced Summon and names the leader', () => {
  const { rerender } = mount();
  act(() => stage.open('programming'));
  act(() => presenting.minimize());

  deliver({ surface: 'document' }, 'summon');
  rerender(tree());

  expect(screen.queryByRole('button', { name: /^Reopen / })).toBeNull();
  expect(screen.getByText('document activity')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('Brought here by Lan');
});

it('pulses the minimized chip and announces an activity opened through Follow', () => {
  const { rerender } = mount();
  act(() => stage.open('programming'));
  deliver({ surface: 'stage' }, 'follow', false);
  rerender(tree());
  // Accept the invitation without restoring the activities.
  clickToastAction();
  act(() => presenting.minimize());

  deliver({ surface: 'document' }, 'follow.update', false);
  rerender(tree());

  expect(nav.following?.leaderId).toBe('leader');
  const chip = screen.getByRole('button', {
    name: `Reopen ${messages.meet.collaboration.document}`,
  });
  expect(chip.querySelector('[class*="animate-pulse"]')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe(
    `Lan opened ${messages.meet.collaboration.document}`
  );
});

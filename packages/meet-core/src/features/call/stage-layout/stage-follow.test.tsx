// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import type { NavigationEvent } from '../components/room-navigation-policy';
import type { MeetRoomController } from '../lib/room-controller';
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
let stage: ReturnType<typeof useStageLayout>;
let nav: ReturnType<typeof useStageNavigation>;
let summoned: string[] = [];

function Harness() {
  stage = useStageLayout({
    accountId: 'me',
    meetingId: 'm',
    isAvailable: () => true,
    tier: 'desktop',
  });
  const room = useRef({
    state: {},
    requestNavigation: vi.fn(),
  }).current;
  room.state = {
    participants: people,
    selfUserId: 'me',
    navigation: events,
    settings: {},
    role: 'participant',
    canManageParticipants: false,
    error: null,
  };
  nav = useStageNavigation({
    room: room as unknown as MeetRoomController,
    stage,
    drawer: null,
    onDrawer: () => {},
    onBroughtIn: () => {},
    onSummoned: (id) => summoned.push(id),
    access: {
      browse: true,
      account: true,
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
  summoned = [];
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

it('ends following when the person moves on their own', () => {
  const view = mount();
  act(() => {
    stage.open('tool:live-qa');
    stage.open('programming');
  });
  deliver({ surface: 'stage' }, 'follow');
  view.rerender(tree());
  expect(nav.following).not.toBeNull();
  act(() => stage.open('tool:live-qa'));
  view.rerender(tree());
  expect(nav.following).toBeNull();
});

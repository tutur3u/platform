// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import { useMeetTool } from './context';
import {
  type MeetToolDefinition,
  type MeetToolPanelProps,
  meetTools,
  meetToolsFor,
} from './registry';
import { roomActivityTools } from './live-activities/activity-manager';
import { toolIdFromDrawer, useMeetTools } from './use-meet-tools';

function SamplePanel({ roomRole, participantId }: MeetToolPanelProps) {
  const { meetingId, close } = useMeetTool();
  return (
    <button type="button" onClick={close}>
      panel for {meetingId} as {roomRole} {participantId}
    </button>
  );
}

const sample: MeetToolDefinition = {
  id: 'polls',
  label: 'meet.call.polls.title',
  icon: () => null,
  Panel: SamplePanel,
};
const literal: MeetToolDefinition = {
  id: 'literal',
  label: 'Q&A',
  icon: () => null,
  Panel: SamplePanel,
};

function Harness({
  drawer,
  onDrawer,
  available = true,
  activitiesOnly,
  registry = [sample, literal],
}: {
  drawer: string | null;
  onDrawer: (next: string | null) => void;
  available?: boolean;
  activitiesOnly?: boolean;
  registry?: readonly MeetToolDefinition[];
}) {
  const tools = useMeetTools<'polls' | 'quiz-arena' | 'forms'>({
    drawer,
    onDrawer,
    meetingId: 'meeting',
    accountId: 'person',
    requiresAccount: false,
    canManage: true,
    enabled: true,
    available,
    activitiesOnly,
    tools: registry,
  });
  return (
    <>
      <div data-testid="menu">{tools.menu}</div>
      <output data-testid="shown">
        {tools.shown.map(({ id }) => id).join(' ')}
      </output>
      {tools.panel}
      <button type="button" onClick={() => tools.route('polls')}>
        live poll
      </button>
      <button type="button" onClick={() => tools.route('forms')}>
        forms
      </button>
    </>
  );
}

function renderHarness(props: Parameters<typeof Harness>[0]) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <Harness {...props} />
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

it('lists tools with translated or literal labels and opens one', () => {
  const onDrawer = vi.fn();
  renderHarness({ drawer: null, onDrawer });
  fireEvent.click(screen.getByRole('button', { name: 'Polls' }));
  expect(onDrawer).toHaveBeenCalledWith('tool:polls');
  fireEvent.click(screen.getByRole('button', { name: 'Q&A' }));
  expect(onDrawer).toHaveBeenCalledWith('tool:literal');
});

it('renders the open tool with call context and closes it', () => {
  const onDrawer = vi.fn();
  renderHarness({ drawer: 'tool:polls', onDrawer });
  fireEvent.click(
    screen.getByRole('button', { name: 'panel for meeting as host person' })
  );
  expect(onDrawer).toHaveBeenCalledWith(null);
});

it('routes live poll shortcuts into the hub and passes other drawers through', () => {
  const onDrawer = vi.fn();
  const { unmount } = renderHarness({ drawer: null, onDrawer });
  fireEvent.click(screen.getByRole('button', { name: 'live poll' }));
  expect(onDrawer).toHaveBeenLastCalledWith('tool:polls');
  fireEvent.click(screen.getByRole('button', { name: 'forms' }));
  expect(onDrawer).toHaveBeenLastCalledWith('forms');
  unmount();
  renderHarness({ drawer: 'tool:polls', onDrawer });
  fireEvent.click(screen.getByRole('button', { name: 'live poll' }));
  expect(onDrawer).toHaveBeenLastCalledWith(null);
});

it('hides the hub list when tools are not available but keeps an open panel', () => {
  renderHarness({ drawer: 'tool:polls', onDrawer: vi.fn(), available: false });
  expect(screen.getByTestId('menu').childElementCount).toBe(0);
  expect(
    screen.getByRole('button', { name: 'panel for meeting as host person' })
  ).toBeTruthy();
});

it('lets someone who only runs activities browse those and the pen board, nothing else', () => {
  const shown = () => screen.getByTestId('shown').textContent;
  const all = meetTools.map(({ id }) => id).join(' ');
  // A workspace co-host in a room whose tools are for hosts only.
  const cohost = renderHarness({
    drawer: null,
    onDrawer: vi.fn(),
    activitiesOnly: true,
    registry: meetTools,
  });
  expect(shown()).toBe(
    'live-assessment live-flashcards live-game live-icebreaker pen-whiteboard'
  );
  for (const hostsOnly of ['Polls', 'Q&A'])
    expect(screen.queryByRole('button', { name: hostsOnly })).toBeNull();
  cohost.unmount();
  // Someone who may use the room's tools browses all of them.
  const member = renderHarness({
    drawer: null,
    onDrawer: vi.fn(),
    registry: meetTools,
  });
  expect(shown()).toBe(all);
  member.unmount();
  // Someone who may do neither browses none.
  renderHarness({
    drawer: null,
    onDrawer: vi.fn(),
    available: false,
    activitiesOnly: true,
    registry: meetTools,
  });
  expect(shown()).toBe('');
});

it('registers polls, timer, quiz, the live activities and the pen board in order', () => {
  expect(meetTools.map((tool) => tool.id)).toEqual([
    'polls',
    'timers',
    'quiz',
    'live-qa',
    'live-assessment',
    'live-flashcards',
    'live-game',
    'live-icebreaker',
    'pen-whiteboard',
  ]);
  expect(toolIdFromDrawer('tool:quiz')).toBe('quiz');
  expect(toolIdFromDrawer('chat')).toBeNull();
});

it('offers the assessment in the menu and to co-hosts only while it is switched on', () => {
  const ids = (tools: readonly MeetToolDefinition[]) =>
    tools.map(({ id }) => id);
  const on = meetToolsFor({ assessment: true });
  const off = meetToolsFor({ assessment: false });
  expect(ids(on)).toContain('live-assessment');
  expect(ids(roomActivityTools(on))).toContain('live-assessment');
  expect(ids(off)).not.toContain('live-assessment');
  expect(ids(roomActivityTools(off))).toEqual([
    'live-flashcards',
    'live-game',
    'live-icebreaker',
    'pen-whiteboard',
  ]);
  // Nothing else leaves the menu with it.
  expect(ids(off)).toEqual(ids(on).filter((id) => id !== 'live-assessment'));
  // The switch is on.
  expect(ids(meetTools)).toEqual(ids(on));
  renderHarness({ drawer: null, onDrawer: vi.fn(), registry: off });
  expect(screen.getByTestId('shown').textContent).not.toContain(
    'live-assessment'
  );
});

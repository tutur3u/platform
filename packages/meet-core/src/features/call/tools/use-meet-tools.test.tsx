// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MEET_LIVE_ASSESSMENT_ENABLED } from '@tuturuuu/realtime/meet';
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
import { useMeetTools } from './use-meet-tools';

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
  open = [],
  onToggle,
  onClose = () => {},
  available = true,
  activitiesOnly,
  registry = [sample, literal],
}: {
  open?: readonly string[];
  onToggle: (id: string) => void;
  onClose?: (id: string) => void;
  available?: boolean;
  activitiesOnly?: boolean;
  registry?: readonly MeetToolDefinition[];
}) {
  const tools = useMeetTools({
    stage: {
      isOpen: (id) => open.includes(id),
      toggle: onToggle,
      close: onClose,
    },
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
      <output data-testid="open">{tools.openIds.join(' ')}</output>
      {open.map((id) => (
        <div key={id}>{tools.renderPanel(id)}</div>
      ))}
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
  const onToggle = vi.fn();
  renderHarness({ onToggle });
  fireEvent.click(screen.getByRole('button', { name: 'Polls' }));
  expect(onToggle).toHaveBeenCalledWith('tool:polls');
  fireEvent.click(screen.getByRole('button', { name: 'Q&A' }));
  expect(onToggle).toHaveBeenCalledWith('tool:literal');
});

it('renders every open tool with call context and closes only that one', () => {
  const onClose = vi.fn();
  renderHarness({
    open: ['tool:polls', 'tool:literal'],
    onToggle: vi.fn(),
    onClose,
  });
  expect(screen.getByTestId('open').textContent).toBe('polls literal');
  const panels = screen.getAllByRole('button', {
    name: 'panel for meeting as host person',
  });
  expect(panels).toHaveLength(2);
  fireEvent.click(panels[1] as HTMLElement);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledWith('tool:literal');
});

it('hides the hub list when tools are not available but keeps an open panel', () => {
  renderHarness({
    open: ['tool:polls'],
    onToggle: vi.fn(),
    available: false,
  });
  expect(screen.getByTestId('menu').childElementCount).toBe(0);
  expect(
    screen.getByRole('button', { name: 'panel for meeting as host person' })
  ).toBeTruthy();
});

it('lets someone who only runs activities browse those and the pen board, nothing else', () => {
  const shown = () => screen.getByTestId('shown').textContent;
  const tools = meetToolsFor({ assessment: true });
  const all = tools.map(({ id }) => id).join(' ');
  // A workspace co-host in a room whose tools are for hosts only.
  const cohost = renderHarness({
    onToggle: vi.fn(),
    activitiesOnly: true,
    registry: tools,
  });
  expect(shown()).toBe(
    'live-assessment live-flashcards live-game live-icebreaker pen-whiteboard'
  );
  for (const hostsOnly of ['Polls', 'Q&A'])
    expect(screen.queryByRole('button', { name: hostsOnly })).toBeNull();
  cohost.unmount();
  // Someone who may use the room's tools browses all of them.
  const member = renderHarness({
    onToggle: vi.fn(),
    registry: tools,
  });
  expect(shown()).toBe(all);
  member.unmount();
  // Someone who may do neither browses none.
  renderHarness({
    onToggle: vi.fn(),
    available: false,
    activitiesOnly: true,
    registry: tools,
  });
  expect(shown()).toBe('');
});

it('registers polls, timer, quiz, the live activities and the pen board in order', () => {
  // The default registry is the one for the configured switch.
  expect(meetTools).toEqual(
    meetToolsFor({ assessment: MEET_LIVE_ASSESSMENT_ENABLED })
  );
  expect(meetTools.some((tool) => tool.id === 'live-assessment')).toBe(
    MEET_LIVE_ASSESSMENT_ENABLED
  );
  expect(meetToolsFor({ assessment: true }).map((tool) => tool.id)).toEqual([
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
  // What the call offers by default follows the configured switch.
  expect(ids(meetTools)).toEqual(ids(MEET_LIVE_ASSESSMENT_ENABLED ? on : off));
  renderHarness({ onToggle: vi.fn(), registry: off });
  expect(screen.getByTestId('shown').textContent).not.toContain(
    'live-assessment'
  );
});

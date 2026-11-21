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
} from './registry';
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
}: {
  drawer: string | null;
  onDrawer: (next: string | null) => void;
  available?: boolean;
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
    tools: [sample, literal],
  });
  return (
    <>
      <div data-testid="menu">{tools.menu}</div>
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

it('registers polls, timer, quiz and the live activities in order', () => {
  expect(meetTools.map((tool) => tool.id)).toEqual([
    'polls',
    'timers',
    'quiz',
    'live-qa',
    'live-assessment',
    'live-flashcards',
    'live-game',
    'live-icebreaker',
  ]);
  expect(toolIdFromDrawer('tool:quiz')).toBe('quiz');
  expect(toolIdFromDrawer('chat')).toBeNull();
});

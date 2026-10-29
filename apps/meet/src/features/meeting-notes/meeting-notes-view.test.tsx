// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { MeetAiState } from '@tuturuuu/internal-api';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../messages/en.json';
import { MeetingNotesView } from './meeting-notes-view';

const mocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  followups: vi.fn(() => null),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('@/features/meeting-ai/meeting-followups', () => ({
  MeetingFollowups: mocks.followups,
}));

const speaker = (displayName: string) => ({
  accountId: displayName,
  displayName,
  kind: 'microphone' as const,
});
const state: MeetAiState = {
  configured: true,
  canManage: false,
  model: 'test',
  transcriptionCostUsd: null,
  notesCostUsd: null,
  estimatedCostUsd: null,
  unpricedRequests: null,
  inputTokens: null,
  outputTokens: null,
  sessions: [
    {
      id: 'session-1',
      user_id: 'host',
      created_at: '2026-10-30T01:00:00Z',
      ended_at: '2026-10-30T02:00:00Z',
      notes_started_at: null,
      notes_status: 'completed',
      notes_cost_usd: null,
      notes: {
        incomplete: false,
        summary: 'The team agreed on the launch plan.',
        decisions: ['Launch on Friday'],
        actionItems: [
          { task: 'Draft the release note', owner: 'Bob', dueDate: null },
        ],
        openQuestions: ['Who owns QA?'],
        calendarSuggestions: [
          {
            title: 'Launch review',
            evidence: 'review the launch on Thursday afternoon',
            timeText: 'Thursday',
            startLocal: null,
            endLocal: null,
            timezone: null,
          },
          {
            title: 'Missing',
            evidence: 'a sentence nobody said aloud',
            timeText: null,
            startLocal: null,
            endLocal: null,
            timezone: null,
          },
        ],
      },
    },
  ],
  chunks: [
    {
      id: 'c0',
      sequence: 0,
      start_seconds: 0,
      duration_seconds: 30,
      status: 'completed',
      transcript: 'Let us launch on Friday',
      speaker: speaker('Alice'),
      cost_usd: null,
    },
    {
      id: 'c1',
      sequence: 1,
      start_seconds: 75,
      duration_seconds: 30,
      status: 'completed',
      transcript: 'We should review the launch on Thursday afternoon',
      speaker: speaker('Bob'),
      cost_usd: null,
    },
  ],
};

function renderView(
  overrides: Partial<Parameters<typeof MeetingNotesView>[0]>
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MeetingNotesView
        wsId="ws"
        meetingId="meeting"
        title="Launch sync"
        data={state}
        isLoading={false}
        error={null}
        {...overrides}
      />
    </NextIntlClientProvider>
  );
}
const openTab = (name: string) =>
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it('shows summary, decisions, action items, questions and follow-ups', () => {
  renderView({});
  expect(screen.getByText('The team agreed on the launch plan.')).toBeTruthy();
  expect(screen.getByText('Launch on Friday')).toBeTruthy();
  expect(screen.getByText('Draft the release note · Owner: Bob')).toBeTruthy();
  expect(screen.getByText('Who owns QA?')).toBeTruthy();
  expect(mocks.followups.mock.calls[0]?.[0]).toMatchObject({
    wsId: 'ws',
    meetingId: 'meeting',
  });
  expect(screen.getByText('Not found in transcript')).toBeTruthy();
});

it('jumps from an evidence quote to the matching transcript line', async () => {
  renderView({});
  fireEvent.click(screen.getByRole('button', { name: 'Show in transcript' }));
  const list = await screen.findByRole('list', { name: 'Transcript' });
  const focused = list.querySelector('[data-focused]');
  expect(focused?.textContent).toContain(
    'We should review the launch on Thursday afternoon'
  );
  expect(focused?.textContent).toContain('1:15');
  await waitFor(() => expect(document.activeElement).toBe(focused));
});

it('searches transcript lines and reports the match count', async () => {
  renderView({});
  openTab('Transcript');
  const search = await screen.findByRole('searchbox', {
    name: 'Search the transcript',
  });
  fireEvent.change(search, { target: { value: 'THURSDAY' } });
  const list = screen.getByRole('list', { name: 'Transcript' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByRole('status').textContent).toBe('1 matching line');
  fireEvent.change(search, { target: { value: 'nothing like this' } });
  expect(screen.getByRole('status').textContent).toBe('No matching lines');
});

it('copies and exports the full transcript', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  let exported: Blob | undefined;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    exported = blob;
    return 'blob:transcript';
  });
  URL.revokeObjectURL = vi.fn();
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('launch-sync-transcript.md');
    });
  renderView({});
  openTab('Transcript');
  fireEvent.click(await screen.findByRole('button', { name: 'Copy' }));
  await waitFor(() => expect(mocks.success).toHaveBeenCalled());
  expect(writeText).toHaveBeenCalledWith(
    '[0:00] Alice: Let us launch on Friday\n[1:15] Bob: We should review the launch on Thursday afternoon'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Export .md' }));
  expect(click).toHaveBeenCalledTimes(1);
  expect(await exported?.text()).toContain(
    '**[1:15] Bob:** We should review the launch on Thursday afternoon'
  );
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:transcript');
  click.mockRestore();
});

it('renders loading, error and empty states without transcript content', () => {
  const { rerender } = renderView({ data: undefined, isLoading: true });
  expect(screen.getByRole('status').textContent).toBe(
    'Loading notes and transcript…'
  );
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MeetingNotesView
        wsId="ws"
        meetingId="meeting"
        title="Launch sync"
        data={undefined}
        isLoading={false}
        error={new Error('forbidden')}
      />
    </NextIntlClientProvider>
  );
  expect(screen.getByRole('alert').textContent).toContain('unavailable');
  expect(screen.queryByRole('tab')).toBeNull();
  cleanup();
  renderView({ data: { ...state, sessions: [], chunks: [] } });
  expect(
    screen.getByText('No notes yet. Notes appear after transcription stops.')
  ).toBeTruthy();
  openTab('Transcript');
  expect(screen.getByText('No transcript yet.')).toBeTruthy();
});

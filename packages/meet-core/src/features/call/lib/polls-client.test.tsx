// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { PollsView } from '@tuturuuu/realtime/meet/room-polls';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import { MeetToolProvider } from '../tools/context';
import { PollsToolPanel } from '../tools/polls/polls-tool-panel';
import { meetRoomTools } from '../tools/room-tool-messages';
import {
  POLLS_GUEST_REFRESH_MS,
  POLLS_IDLE_REFRESH_MS,
  POLLS_LIVE_REFRESH_MS,
  POLLS_WS_REFETCH_JITTER_MS,
  pollsRefreshInterval,
  useCallPolls,
} from './polls-client';

const mocks = vi.hoisted(() => ({
  json: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/client', () => ({
  encodePathSegment: (value: string) => encodeURIComponent(value),
  getInternalApiClient: () => ({ json: mocks.json }),
  resolveOwnAppApiPath: (_app: string, path: string) => path,
}));

const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
const pollId = '55555555-5555-4555-8555-555555555555';
const guestId = '33333333-3333-4333-8333-333333333333';

const activePoll = {
  id: pollId,
  kind: 'poll',
  status: 'active',
  type: 'single_choice',
  options: [
    { id: 'choice-a', label: 'AI off first; hints after' },
    { id: 'choice-b', label: 'AI only for checking' },
  ],
  anonymous: true,
  question: 'Which AI rule fits your class best?',
  resultsVisible: false,
  myResponse: null,
  results: null,
} satisfies PollsView['polls'][number];

const closedPoll = {
  ...activePoll,
  status: 'closed',
  resultsVisible: true,
  results: {
    responseCount: 2,
    tally: [
      { label: 'AI off first; hints after', count: 1 },
      { label: 'AI only for checking', count: 1 },
    ],
  },
} satisfies PollsView['polls'][number];

function GuestBackgroundObserver() {
  useCallPolls(meetingId, guestId, true, true, true);
  return null;
}

function renderGuestPolls(withSecondHook = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={client}>
        {withSecondHook && <GuestBackgroundObserver />}
        <MeetToolProvider
          value={{
            meetingId,
            accountId: guestId,
            requiresAccount: true,
            canManage: false,
            enabled: true,
            close: vi.fn(),
          }}
        >
          <PollsToolPanel />
        </MeetToolProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  mocks.json.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  cleanup();
});

it('keeps guest fallback polling at 15s even while open with an active poll', () => {
  expect(POLLS_GUEST_REFRESH_MS).toBeGreaterThanOrEqual(15_000);
  expect(POLLS_WS_REFETCH_JITTER_MS).toBe(750);
  expect(pollsRefreshInterval(true, true, true)).toBe(POLLS_GUEST_REFRESH_MS);
  expect(pollsRefreshInterval(true, false, true)).toBe(POLLS_GUEST_REFRESH_MS);
  expect(pollsRefreshInterval(false, true, true)).toBe(POLLS_GUEST_REFRESH_MS);
  expect(pollsRefreshInterval(false, false, true)).toBe(POLLS_GUEST_REFRESH_MS);
  expect(pollsRefreshInterval(true, false, false)).toBe(POLLS_LIVE_REFRESH_MS);
  expect(pollsRefreshInterval(false, true, false)).toBe(POLLS_LIVE_REFRESH_MS);
  expect(pollsRefreshInterval(false, false, false)).toBe(POLLS_IDLE_REFRESH_MS);
});

it('updates the guest UI to Closed immediately and coalesces the jittered WS refetch across hooks', async () => {
  let current: PollsView = { canManage: false, polls: [activePoll] };
  mocks.json.mockImplementation(async () => current);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);

  renderGuestPolls(true);

  await screen.findByRole('heading', {
    name: 'Which AI rule fits your class best?',
  });
  expect(screen.getByText('Active')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Submit response' })).toBeTruthy();
  expect(mocks.json).toHaveBeenCalledTimes(1);

  vi.useFakeTimers();
  current = { canManage: false, polls: [closedPoll] };
  act(() => {
    meetRoomTools.handleMessage(
      meetingId,
      { type: 'polls.changed', pollId, status: 'closed' },
      { sendLiveQa: () => true, sendSharedTool: () => true }
    );
  });

  // Optimistic patch closes the ballot immediately before the jittered GET runs.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText('Closed')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Submit response' })).toBeNull();
  expect(mocks.json).toHaveBeenCalledTimes(1);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(370);
  });
  expect(mocks.json).toHaveBeenCalledTimes(1);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(mocks.json).toHaveBeenCalledTimes(2);
  expect(screen.getByText('2 responses')).toBeTruthy();
});

it('hides results and removes deleted polls immediately on polls.changed', async () => {
  let current: PollsView = {
    canManage: false,
    polls: [
      {
        ...activePoll,
        resultsVisible: true,
        results: closedPoll.results,
      },
    ],
  };
  mocks.json.mockImplementation(async () => current);
  vi.spyOn(Math, 'random').mockReturnValue(0);

  renderGuestPolls();
  await screen.findByText('2 responses');

  current = { canManage: false, polls: [activePoll] };
  act(() => {
    meetRoomTools.handleMessage(
      meetingId,
      { type: 'polls.changed', pollId, resultsVisible: false },
      { sendLiveQa: () => true, sendSharedTool: () => true }
    );
  });

  await screen.findByText('Results hidden');
  expect(screen.queryByText('2 responses')).toBeNull();

  current = { canManage: false, polls: [] };
  act(() => {
    meetRoomTools.handleMessage(
      meetingId,
      { type: 'polls.changed', pollId, deleted: true },
      { sendLiveQa: () => true, sendSharedTool: () => true }
    );
  });

  await waitFor(() =>
    expect(
      screen.queryByRole('heading', {
        name: 'Which AI rule fits your class best?',
      })
    ).toBeNull()
  );
});

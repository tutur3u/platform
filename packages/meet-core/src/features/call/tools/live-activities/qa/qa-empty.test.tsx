// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MeetRealtimeServerMessage } from '@tuturuuu/realtime/meet';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../../../apps/meet/messages/en.json';
import { qaEmptyKind } from './qa-empty';
import { LiveQaClientContext, QaPanel } from './qa-panel';
import {
  createLiveQaClient,
  type LiveQaQuestion,
  type LiveQaSnapshot,
} from './qa-store';

vi.mock('@tuturuuu/internal-api', () => ({
  readMeetChatFile: vi.fn(),
  uploadMeetChatFile: vi.fn(),
  discardMeetChatFile: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../panel-frame', () => ({
  LiveActivityPanelFrame: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));
afterEach(cleanup);

const strings = messages.meet.call.live_activities.qa;
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '33333333-3333-4333-8333-333333333333';

function question(extra: Partial<LiveQaQuestion> = {}): LiveQaQuestion {
  return {
    id: crypto.randomUUID(),
    participantId: OTHER,
    authorName: 'Lan',
    text: 'When is the quiz?',
    upvotes: [],
    answered: false,
    hidden: false,
    createdAt: '2026-11-23T07:58:00Z',
    answers: [],
    ...extra,
  };
}

function mount(snapshot: LiveQaSnapshot, host?: LiveQaSnapshot) {
  let receive: (message: MeetRealtimeServerMessage) => void = () => {};
  const client = createLiveQaClient({
    send: vi.fn(),
    subscribe: (listener) => {
      receive = listener;
      return () => {};
    },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <LiveQaClientContext value={client}>
          <QaPanel meetingId="meeting" />
        </LiveQaClientContext>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  act(() => {
    receive({
      type: 'qa.snapshot',
      snapshot,
      self: { actor: ME, participantId: ME },
    });
    if (host) receive({ type: 'qa.host', snapshot: host });
  });
}

it('keeps "No questions yet" for a Q&A where nothing was asked', () => {
  mount({ questions: [] });
  expect(screen.getByText(strings.empty)).toBeTruthy();
  expect(screen.queryByText(strings.empty_all_answered)).toBeNull();
});

it('celebrates an answered Q&A with no open questions', () => {
  mount({ questions: [question({ answered: true })] });
  const state = screen.getByRole('status');
  expect(state.textContent).toContain(strings.empty_all_answered);
  expect(state.textContent).toContain(strings.empty_all_answered_hint);
  expect(screen.queryByText(strings.empty)).toBeNull();
  // The answered question is still one tab away.
  fireEvent.mouseDown(
    screen.getByRole('tab', { name: strings.sort.answered }),
    {
      button: 0,
    }
  );
  expect(screen.getByText('When is the quiz?')).toBeTruthy();
  expect(screen.queryByText(strings.empty_all_answered)).toBeNull();
});

it('lists open questions instead of any empty state', () => {
  mount({ questions: [question(), question({ answered: true })] });
  expect(screen.getByText('When is the quiz?')).toBeTruthy();
  expect(screen.queryByText(strings.empty_all_answered)).toBeNull();
  expect(screen.queryByText(strings.empty)).toBeNull();
});

it('tells a host that moderation hides every question', () => {
  const hidden = question({ hidden: true });
  mount({ questions: [] }, { questions: [hidden], revision: 1 });
  expect(screen.getByText('1 question is hidden')).toBeTruthy();
  expect(screen.getByText(strings.empty_hidden_hint)).toBeTruthy();
  expect(screen.queryByText(strings.empty)).toBeNull();
  // Moderate brings the hidden question back for review.
  fireEvent.click(screen.getByRole('button', { name: /Moderate/ }));
  expect(screen.getByText('When is the quiz?')).toBeTruthy();
  expect(screen.queryByText('1 question is hidden')).toBeNull();
});

it('chooses the empty state from what was asked', () => {
  const guest = { isHost: false, reviewing: false };
  expect(qaEmptyKind('top', { answered: 0, hidden: 0 }, guest)).toBe('none');
  expect(qaEmptyKind('newest', { answered: 2, hidden: 0 }, guest)).toBe(
    'all_answered'
  );
  expect(qaEmptyKind('answered', { answered: 0, hidden: 0 }, guest)).toBe(
    'none_answered'
  );
  expect(
    qaEmptyKind('top', { answered: 0, hidden: 1 }, { ...guest, isHost: true })
  ).toBe('hidden');
  // Participants never see hidden questions, so they get the plain state.
  expect(qaEmptyKind('top', { answered: 0, hidden: 1 }, guest)).toBe('none');
  // While reviewing, hidden questions are listed, so empty means none.
  expect(
    qaEmptyKind(
      'top',
      { answered: 0, hidden: 1 },
      { isHost: true, reviewing: true }
    )
  ).toBe('none');
});

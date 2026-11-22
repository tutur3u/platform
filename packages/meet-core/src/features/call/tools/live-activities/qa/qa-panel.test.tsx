// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MeetRealtimeServerMessage } from '@tuturuuu/realtime/meet';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../../../apps/meet/messages/en.json';
import { LiveQaClientContext, QaPanel } from './qa-panel';
import {
  createLiveQaClient,
  type LiveQaQuestion,
  type LiveQaSelf,
  type LiveQaSnapshot,
} from './qa-store';

const files = vi.hoisted(() => ({
  readMeetChatFile: vi.fn(),
  uploadMeetChatFile: vi.fn(),
  discardMeetChatFile: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@tuturuuu/internal-api', () => files);
vi.mock('../panel-frame', () => ({
  LiveActivityPanelFrame: ({
    title,
    actions,
    children,
  }: {
    title: string;
    actions?: ReactNode;
    children: ReactNode;
  }) => (
    <section aria-label={title}>
      {actions}
      {children}
    </section>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const strings = messages.meet.call.live_activities.qa;
const GUEST = '11111111-1111-4111-8111-111111111111';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const FILE = '44444444-4444-4444-8444-444444444444';
const IMAGE = '55555555-5555-4555-8555-555555555555';

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

function mount({
  snapshot,
  self = { actor: GUEST, participantId: GUEST },
  host,
}: {
  snapshot: LiveQaSnapshot;
  self?: LiveQaSelf;
  host?: LiveQaSnapshot;
}) {
  const send = vi.fn();
  let receive: (message: MeetRealtimeServerMessage) => void = () => {};
  const client = createLiveQaClient({
    send,
    subscribe: (listener) => {
      receive = listener;
      return () => {};
    },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider
        locale="en"
        messages={messages}
        timeZone="UTC"
        now={new Date('2026-11-23T08:00:00Z')}
      >
        <LiveQaClientContext value={client}>
          <QaPanel meetingId="meeting" />
        </LiveQaClientContext>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  act(() => {
    receive({ type: 'qa.snapshot', snapshot, self });
    if (host) receive({ type: 'qa.host', snapshot: host });
  });
  return { send, receive, client };
}

it('gives every input a placeholder and sends a question with its request id', () => {
  const { send } = mount({ snapshot: { questions: [question()] } });
  const ask = screen.getByPlaceholderText(strings.composer_placeholder);
  expect(ask).toHaveProperty('placeholder', strings.composer_placeholder);
  fireEvent.click(screen.getByRole('button', { name: strings.answer }));
  expect(screen.getByPlaceholderText(strings.answer_placeholder)).toBeTruthy();
  for (const field of document.querySelectorAll('textarea, input:not([type])'))
    expect(field.getAttribute('placeholder')).toBeTruthy();
  fireEvent.change(ask, { target: { value: 'A question' } });
  fireEvent.submit(ask.closest('form')!);
  return waitFor(() =>
    expect(send).toHaveBeenCalledWith({
      type: 'qa.ask',
      text: 'A question',
      attachmentIds: [],
      requestId: expect.stringMatching(/^qa:/),
    })
  );
});

it('marks a guest vote from the room key and toggles it off', () => {
  const voted = question({ upvotes: [GUEST, OTHER] });
  const { send } = mount({ snapshot: { questions: [voted] } });
  const button = screen.getByRole('button', {
    name: 'Remove your upvote. 2 votes',
  });
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText(strings.you_voted)).toBeTruthy();
  fireEvent.click(button);
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'qa.upvote',
      questionId: voted.id,
      upvoted: false,
    })
  );
});

it('marks a signed-in vote by account, not by room id', () => {
  mount({
    snapshot: { questions: [question({ upvotes: [GUEST] })] },
    self: { actor: ACCOUNT, participantId: GUEST },
  });
  const button = screen.getByRole('button', { name: 'Upvote. 1 vote' });
  expect(button.getAttribute('aria-pressed')).toBe('false');
  expect(screen.queryByText(strings.you_voted)).toBeNull();
});

it('renders answers with image thumbnails and file chips from signed reads', async () => {
  files.readMeetChatFile.mockImplementation(async (_meeting, id: string) =>
    id === IMAGE
      ? {
          url: 'https://files.test/slide.png',
          name: 'slide.png',
          size: 10,
          contentType: 'image/png',
        }
      : {
          url: 'https://files.test/notes.pdf',
          name: 'notes.pdf',
          size: 10,
          contentType: 'application/pdf',
        }
  );
  mount({
    snapshot: {
      questions: [
        question({
          answers: [
            {
              id: crypto.randomUUID(),
              participantId: OTHER,
              authorName: 'Teacher',
              text: 'See the slide.',
              attachmentIds: [IMAGE, FILE],
              createdAt: '2026-11-23T07:59:00Z',
              byHost: true,
            },
          ],
        }),
      ],
    },
  });
  expect(screen.getByText('See the slide.')).toBeTruthy();
  expect(screen.getByText(strings.host_chip)).toBeTruthy();
  expect(await screen.findByAltText('slide.png')).toBeTruthy();
  const chip = await screen.findByRole('link', { name: 'notes.pdf' });
  expect(chip.getAttribute('href')).toBe('https://files.test/notes.pdf');
  expect(files.readMeetChatFile).toHaveBeenCalledWith('meeting', FILE);
  // Only the author or a host may delete an answer.
  expect(
    screen.queryByRole('button', { name: strings.delete_answer })
  ).toBeNull();
});

it('switches between Top, Newest and Answered', () => {
  mount({
    snapshot: {
      questions: [
        question({ text: 'Popular', upvotes: [OTHER, ACCOUNT] }),
        question({ text: 'Recent', createdAt: '2026-11-23T07:59:30Z' }),
        question({ text: 'Done', answered: true }),
      ],
    },
  });
  const order = () =>
    screen
      .getAllByRole('article')
      .map((card) => card.getAttribute('aria-label'));
  expect(order()).toEqual(['Popular', 'Recent']);
  fireEvent.mouseDown(screen.getByRole('tab', { name: strings.sort.newest }));
  expect(order()).toEqual(['Recent', 'Popular']);
  fireEvent.mouseDown(screen.getByRole('tab', { name: strings.sort.answered }));
  expect(order()).toEqual(['Done']);
});

it('shows host tools only with the host view, including hidden questions', () => {
  const hidden = question({ text: 'Off topic', hidden: true });
  const open = question({ text: 'On topic' });
  const { send } = mount({
    snapshot: { questions: [open], revision: 2 },
    host: { questions: [open, hidden], revision: 2 },
  });
  fireEvent.click(screen.getAllByRole('button', { name: strings.pin })[0]!);
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'qa.pin',
      questionId: open.id,
      pinned: true,
    })
  );
  expect(screen.queryByText('Off topic')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Moderate (1)' }));
  expect(screen.getByText('Off topic')).toBeTruthy();
  expect(screen.getByText(strings.hidden_chip)).toBeTruthy();
  fireEvent.click(
    screen.getByRole('switch', { name: strings.allow_anonymous })
  );
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'qa.settings', anonymous: true })
  );
});

it('hides host tools from participants', () => {
  mount({ snapshot: { questions: [question()] } });
  expect(screen.queryByRole('button', { name: strings.pin })).toBeNull();
  expect(screen.queryByRole('button', { name: strings.moderate })).toBeNull();
});

it('opens full screen with the question on screen and leaves on Escape', async () => {
  mount({ snapshot: { questions: [question({ text: 'Big question' })] } });
  fireEvent.click(
    screen.getByRole('button', {
      name: messages.meet.call.live_activities.fullscreen,
    })
  );
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText(strings.on_screen)).toBeTruthy();
  expect(within(dialog).getAllByText('Big question').length).toBeGreaterThan(0);
  expect(
    within(dialog).getByPlaceholderText(strings.composer_placeholder)
  ).toBeTruthy();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    screen.getByPlaceholderText(strings.composer_placeholder)
  ).toBeTruthy();
});

it('shows a room refusal of this person request', () => {
  const { receive } = mount({ snapshot: { questions: [] } });
  act(() =>
    receive({ type: 'error', error: 'qa_rate_limited', requestId: 'qa:1' })
  );
  expect(screen.getByRole('status').textContent).toBe(
    strings.errors.rate_limited
  );
});

it("marks a vote from the room's list of this person's votes, with only a count shared", () => {
  const voted = question({ upvotes: [], upvoteCount: 3 });
  mount({
    snapshot: { questions: [voted, question({ upvoteCount: 1 })] },
    self: { actor: ACCOUNT, participantId: GUEST, votedIds: [voted.id] },
  });
  const button = screen.getByRole('button', {
    name: 'Remove your upvote. 3 votes',
  });
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(
    screen
      .getByRole('button', { name: 'Upvote. 1 vote' })
      .getAttribute('aria-pressed')
  ).toBe('false');
});

it('gives guests no attach actions and no file reads', () => {
  mount({
    snapshot: { questions: [question({ attachmentIds: [FILE] })] },
    self: { actor: GUEST, participantId: GUEST, guest: true },
  });
  expect(
    screen.queryByRole('button', { name: strings.attach_image })
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: strings.attach_file })
  ).toBeNull();
  expect(screen.getByText('Sign in to see the attachment')).toBeTruthy();
  expect(files.readMeetChatFile).not.toHaveBeenCalled();
});

it("removes a deleted answer's files from storage once the room confirms", async () => {
  files.readMeetChatFile.mockResolvedValue({
    url: 'https://files.test/notes.pdf',
    name: 'notes.pdf',
    size: 10,
    contentType: 'application/pdf',
  });
  const answerId = crypto.randomUUID();
  const asked = question({
    answers: [
      {
        id: answerId,
        participantId: GUEST,
        authorName: 'Me',
        text: 'Mine',
        attachmentIds: [FILE],
        createdAt: '2026-11-23T07:59:00Z',
        byHost: false,
      },
    ],
  });
  const { send, receive } = mount({ snapshot: { questions: [asked] } });
  fireEvent.click(screen.getByRole('button', { name: strings.delete_answer }));
  const command = send.mock.calls.at(-1)?.[0];
  expect(command).toMatchObject({
    type: 'qa.answer.delete',
    questionId: asked.id,
    answerId,
  });
  expect(files.discardMeetChatFile).not.toHaveBeenCalled();
  act(() =>
    receive({
      type: 'qa.snapshot',
      snapshot: { questions: [{ ...asked, answers: [] }], revision: 1 },
      requestId: command.requestId,
    })
  );
  await waitFor(() =>
    expect(files.discardMeetChatFile).toHaveBeenCalledWith('meeting', FILE)
  );
});

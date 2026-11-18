// @vitest-environment jsdom
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { PollsView } from '@tuturuuu/realtime/meet/room-polls';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../../apps/meet/messages/vi.json';
import { PollsControl, PollsPanel } from './polls-panel';

const send = vi.hoisted(() => vi.fn());
vi.mock('../lib/polls-client', () => ({
  sendPollAction: send,
  pollsKey: () => ['polls'],
  notifyPollMutation: () => {},
  pollExportUrl: (_meeting: string, _poll: string, format: string) =>
    `/polls?format=${format}`,
}));
vi.mock('./control-bar', () => ({
  ControlButton: ({
    label,
    badge,
    onClick,
  }: {
    label: string;
    badge?: number;
    onClick: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {label} {badge || ''}
    </button>
  ),
}));

const poll = {
  id: 'poll-1',
  kind: 'poll',
  status: 'active',
  type: 'single_choice',
  options: [
    { id: 'choice-a', label: 'First' },
    { id: 'choice-b', label: 'Second' },
  ],
  anonymous: true,
  question: 'Which works best?',
  resultsVisible: false,
  myResponse: null,
  results: null,
} satisfies PollsView['polls'][number];

function renderPanel(data: PollsView, locale = 'en') {
  const client = new QueryClient();
  let view = data;
  const onClose = vi.fn();
  function Fixture() {
    const query = useQuery({
      queryKey: ['polls'],
      queryFn: () => view,
      initialData: data,
    });
    return (
      <>
        <PollsControl query={query} open onClick={onClose} />
        <PollsPanel
          accountId="person"
          meetingId="meeting"
          query={query}
          onClose={onClose}
        />
      </>
    );
  }
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'vi' ? viMessages : en}
      timeZone="UTC"
    >
      <QueryClientProvider client={client}>
        <Fixture />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
  return {
    setView: (value: PollsView) => {
      view = value;
    },
    onClose,
  };
}

afterEach(() => {
  cleanup();
  send.mockReset();
});

it('shows the active indicator and records a vote without displaying hidden results or host actions', async () => {
  const { setView } = renderPanel({ canManage: false, polls: [poll] });
  expect(
    screen.getByRole('button', { name: /Polls \(1 active\)/ })
  ).toBeDefined();
  expect(screen.getByText(/results are hidden by the host/i)).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Close poll' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Download CSV' })).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: 'First' }));
  send.mockImplementationOnce(async () => {
    setView({
      canManage: false,
      polls: [
        {
          ...poll,
          myResponse: { type: 'single_choice', optionId: 'choice-a' },
        },
      ],
    });
    return { ok: true };
  });
  fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));
  await screen.findByText('Your response was recorded.');
  expect(send).toHaveBeenCalledWith('meeting', {
    action: 'vote',
    pollId: 'poll-1',
    response: { type: 'single_choice', optionId: 'choice-a' },
  });
  expect(screen.queryByText('1 response')).toBeNull();
});

it('lets managers reveal results, export both formats and request a Mira summary', async () => {
  renderPanel({
    canManage: true,
    polls: [
      {
        ...poll,
        results: { responseCount: 1, tally: [{ label: 'First', count: 1 }] },
      },
    ],
  });
  expect(screen.getByText('1 response')).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'Download CSV' }).getAttribute('href')
  ).toContain('format=csv');
  expect(
    screen.getByRole('link', { name: 'Download JSON' }).getAttribute('href')
  ).toContain('format=json');
  send.mockResolvedValueOnce({ ok: true });
  fireEvent.click(screen.getByRole('button', { name: 'Show results' }));
  await waitFor(() =>
    expect(send).toHaveBeenCalledWith('meeting', {
      action: 'visibility',
      pollId: 'poll-1',
      resultsVisible: true,
    })
  );
  const summarize = screen.getByRole<HTMLButtonElement>('button', {
    name: 'Summarize with Mira',
  });
  await waitFor(() => expect(summarize.disabled).toBe(false));
  send.mockResolvedValueOnce({ summary: 'First was selected once.' });
  fireEvent.click(summarize);
  await screen.findByText('First was selected once.');
});

it('composes an anonymous Vietnamese Mira draft and explains the fallback', async () => {
  renderPanel({ canManage: true, polls: [] }, 'vi');
  fireEvent.click(screen.getByRole('button', { name: 'Soạn với Mira' }));
  fireEvent.change(screen.getByLabelText('Bình chọn nên hỏi về chủ đề gì?'), {
    target: { value: 'Chủ đề tuần này' },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Ẩn danh' }));
  send.mockResolvedValueOnce({ pollId: 'poll-1', fallback: true });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
  await screen.findByText(/Mira hiện không khả dụng/);
  expect(send).toHaveBeenCalledWith('meeting', {
    action: 'mira_draft',
    prompt: 'Chủ đề tuần này',
    anonymous: true,
    locale: 'vi',
  });
});

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
import en from '../../../../../../../apps/meet/messages/en.json';
import { MeetToolProvider } from '../context';
import { PollsToolPanel } from './polls-tool-panel';

// jsdom has no ResizeObserver; the Radix switch measures itself with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const send = vi.hoisted(() => vi.fn());
const view = vi.hoisted(() => ({ current: null as PollsView | null }));
vi.mock('../../lib/polls-client', () => ({
  sendPollAction: send,
  pollsKey: () => ['polls'],
  notifyPollMutation: () => {},
  pollExportUrl: (_meeting: string, _poll: string, format: string) =>
    `/polls?format=${format}`,
  useCallPolls: () =>
    useQuery({
      queryKey: ['polls'],
      queryFn: () => view.current as PollsView,
      initialData: view.current as PollsView,
    }),
}));

const activePoll = {
  id: 'poll-1',
  kind: 'poll',
  status: 'active',
  type: 'single_choice',
  options: [
    { id: 'choice-a', label: 'First' },
    { id: 'choice-b', label: 'Second' },
  ],
  anonymous: false,
  question: 'Which works best?',
  resultsVisible: false,
  myResponse: null,
  results: null,
} satisfies PollsView['polls'][number];

function renderPanel(data: PollsView) {
  view.current = data;
  const close = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={new QueryClient()}>
        <MeetToolProvider
          value={{
            meetingId: 'meeting',
            accountId: 'person',
            requiresAccount: false,
            canManage: data.canManage,
            enabled: true,
            close,
          }}
        >
          <PollsToolPanel />
        </MeetToolProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
  return { close };
}

afterEach(() => {
  cleanup();
  send.mockReset();
});

it('lets a host start a poll in one step', async () => {
  send
    .mockResolvedValueOnce({ pollId: '00000000-0000-4000-8000-000000000001' })
    .mockResolvedValueOnce({});
  renderPanel({ canManage: true, polls: [] } as unknown as PollsView);

  fireEvent.click(screen.getByRole('button', { name: 'New poll' }));
  fireEvent.change(screen.getByLabelText('Question'), {
    target: { value: 'Lunch?' },
  });
  fireEvent.change(screen.getByLabelText('Choice 1'), {
    target: { value: 'Pho' },
  });
  fireEvent.change(screen.getByLabelText('Choice 2'), {
    target: { value: 'Banh mi' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Start poll' }));

  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(send).toHaveBeenNthCalledWith(1, 'meeting', {
    action: 'create',
    anonymous: false,
    definition: {
      type: 'single_choice',
      question: 'Lunch?',
      options: ['Pho', 'Banh mi'],
    },
  });
  expect(send).toHaveBeenNthCalledWith(2, 'meeting', {
    action: 'launch',
    pollId: '00000000-0000-4000-8000-000000000001',
  });
});

it('adds and removes choices with labelled controls', () => {
  renderPanel({ canManage: true, polls: [] } as unknown as PollsView);
  fireEvent.click(screen.getByRole('button', { name: 'New poll' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add choice' }));
  expect(screen.getByLabelText('Choice 3')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove choice 3' }));
  expect(screen.queryByLabelText('Choice 3')).toBeNull();
});

it('lets a participant vote on an active poll', async () => {
  send.mockResolvedValueOnce({});
  renderPanel({ canManage: false, polls: [activePoll] } as PollsView);

  expect(screen.queryByRole('button', { name: 'New poll' })).toBeNull();
  expect(screen.getByText('Results hidden')).toBeTruthy();
  const submit = screen.getByRole('button', { name: 'Submit response' });
  expect((submit as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('Second'));
  fireEvent.click(submit);

  await waitFor(() =>
    expect(send).toHaveBeenCalledWith('meeting', {
      action: 'vote',
      pollId: 'poll-1',
      response: { type: 'single_choice', optionId: 'choice-b' },
    })
  );
});

it('closes from the panel header', () => {
  const { close } = renderPanel({
    canManage: false,
    polls: [],
  } as unknown as PollsView);
  fireEvent.click(screen.getByRole('button', { name: 'Close polls panel' }));
  expect(close).toHaveBeenCalled();
});

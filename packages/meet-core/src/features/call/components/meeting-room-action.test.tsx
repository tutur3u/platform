// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { isKnownEndedRoom, rememberEndedRoom } from '../lib/ended-room-cache';
import { MeetingRoomAction } from './meeting-room-action';

const mocks = vi.hoisted(() => ({ state: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  getMeetCallRoomState: mocks.state,
}));
const meetingId = '11111111-1111-4111-8111-111111111111';
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  localStorage.clear();
  vi.clearAllMocks();
});
function mount(accountId: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <MeetingRoomAction meetingId={meetingId} accountId={accountId} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
it('keeps notes available while revalidating a cached ended hint', () => {
  mocks.state.mockReturnValue(new Promise(() => {}));
  rememberEndedRoom('account-a', meetingId);
  mount('account-a');
  expect(
    screen
      .getByRole('link', { name: 'View notes & transcript' })
      .getAttribute('href')
  ).toContain('?notes=1');
  expect(mocks.state).toHaveBeenCalledOnce();
});
it('fetches independently for another account and remembers only an observed terminal state', async () => {
  rememberEndedRoom('account-a', meetingId);
  mocks.state.mockResolvedValue({ ended: true, canReadNotes: false });
  mount('account-b');
  await waitFor(() =>
    expect(
      screen.getByRole('link', { name: 'This meeting has ended' })
    ).toBeTruthy()
  );
  expect(mocks.state).toHaveBeenCalledOnce();
  expect(mocks.state).toHaveBeenCalledWith(meetingId, {
    signal: expect.any(AbortSignal),
  });
  cleanup();
  mount('account-b');
  expect(
    screen.getByRole('link', { name: 'View notes & transcript' })
  ).toBeTruthy();
  expect(mocks.state).toHaveBeenCalledTimes(2);
});

it('forgets an ended hint after a server-authorized restored state is observed', async () => {
  rememberEndedRoom('account-a', meetingId);
  mocks.state.mockResolvedValue({
    ended: false,
    canReadNotes: true,
    lifecycleVersion: 4,
  });
  mount('account-a');
  await waitFor(() =>
    expect(screen.getByRole('link', { name: 'Join call' })).toBeTruthy()
  );
});

it('late prior-account lookup cannot recreate an ended hint across actor ABA', async () => {
  let resolve!: (value: {
    ended: boolean;
    canReadNotes: boolean;
    lifecycleVersion: number;
  }) => void;
  const old = new Promise<{
    ended: boolean;
    canReadNotes: boolean;
    lifecycleVersion: number;
  }>((done) => {
    resolve = done;
  });
  let resolveCurrent!: (value: {
    ended: boolean;
    canReadNotes: boolean;
    lifecycleVersion: number;
  }) => void;
  const current = new Promise<{
    ended: boolean;
    canReadNotes: boolean;
    lifecycleVersion: number;
  }>((done) => {
    resolveCurrent = done;
  });
  mocks.state
    .mockReturnValueOnce(old)
    .mockResolvedValueOnce({
      ended: false,
      canReadNotes: true,
      lifecycleVersion: 4,
    })
    .mockReturnValueOnce(current);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const view = (accountId: string) => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <MeetingRoomAction meetingId={meetingId} accountId={accountId} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const ui = render(view('account-a'));
  ui.rerender(view('account-b'));
  await waitFor(() =>
    expect(screen.getByRole('link', { name: 'Join call' })).toBeTruthy()
  );
  ui.rerender(view('account-a'));
  await waitFor(() => expect(mocks.state).toHaveBeenCalledTimes(3));
  await act(async () => {
    resolve({ ended: true, canReadNotes: true, lifecycleVersion: 1 });
    await old;
  });
  expect(mocks.state.mock.calls[0]?.[1].signal.aborted).toBe(true);
  expect(mocks.state.mock.calls[2]?.[1].signal.aborted).toBe(false);
  expect(isKnownEndedRoom('account-a', meetingId)).toBe(false);
  expect(screen.getByRole('link', { name: 'Open meeting' })).toBeTruthy();
  expect(
    screen.queryByRole('link', { name: 'View notes & transcript' })
  ).toBeNull();
  await act(async () => {
    resolveCurrent({ ended: false, canReadNotes: true, lifecycleVersion: 4 });
    await current;
  });
  await waitFor(() =>
    expect(screen.getByRole('link', { name: 'Join call' })).toBeTruthy()
  );
  expect(isKnownEndedRoom('account-a', meetingId)).toBe(false);
  expect(
    screen.getByRole('link', { name: 'Join call' }).getAttribute('href')
  ).not.toContain('?notes=1');
});

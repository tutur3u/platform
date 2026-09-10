// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en.json';
import { rememberEndedRoom } from '../lib/ended-room-cache';
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
it('shows a cached ended card immediately without fetching permissions or room state', () => {
  rememberEndedRoom('account-a', meetingId);
  mount('account-a');
  expect(
    screen.getByRole('link', { name: 'This meeting has ended' })
  ).toBeTruthy();
  expect(mocks.state).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('link', { name: 'View notes & transcript' })
  ).toBeNull();
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
  expect(mocks.state).toHaveBeenCalledWith(meetingId);
});

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
it('keeps the server-checked notes entry available for cached ended rooms', () => {
  rememberEndedRoom('account-a', meetingId);
  mount('account-a');
  expect(
    screen
      .getByRole('link', { name: 'View notes & transcript' })
      .getAttribute('href')
  ).toContain('?notes=1');
  expect(mocks.state).not.toHaveBeenCalled();
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
  cleanup();
  mount('account-b');
  expect(
    screen.getByRole('link', { name: 'View notes & transcript' })
  ).toBeTruthy();
  expect(mocks.state).toHaveBeenCalledOnce();
});

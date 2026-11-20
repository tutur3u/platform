// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const f = vi.hoisted(() => ({ read: vi.fn(), choose: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  readRoomMiraConsent: f.read,
  setRoomMiraChoice: f.choose,
}));
vi.mock('./mira-profile', () => ({ MiraAvatar: () => null }));

import { RoomMiraNotice } from './room-mira-notice';

const call = messages.meet.call;
const version = '2026-11-20-room-v1';
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <RoomMiraNotice meetingId="room" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it('renders nothing while room Mira is unavailable', async () => {
  f.read.mockResolvedValue({ available: false });
  show();
  await vi.waitFor(() => expect(f.read).toHaveBeenCalled());
  expect(screen.queryByText(call.room_mira_title)).toBeNull();
});

it('asks for a choice and records Continue for the current notice', async () => {
  f.read.mockResolvedValue({
    available: true,
    version,
    choice: null,
    fence: { ready: false, pending: 2, admitted: 2 },
  });
  f.choose.mockResolvedValue({
    available: true,
    version,
    choice: 'continue',
    fence: { ready: false, pending: 1, admitted: 2 },
  });
  show();
  await screen.findByText(call.room_mira_prompt);
  fireEvent.click(
    screen.getByRole('button', { name: call.room_mira_continue })
  );
  await screen.findByText('Waiting for 1 person to choose Continue.');
  expect(f.choose).toHaveBeenCalledWith('room', 'continue', version);
  expect(
    screen.getByRole('button', { name: call.room_mira_pause })
  ).toBeTruthy();
});

it('shows that everyone chose Continue', async () => {
  f.read.mockResolvedValue({
    available: true,
    version,
    choice: 'continue',
    fence: { ready: true, pending: 0, admitted: 3 },
  });
  show();
  await screen.findByText(call.room_mira_ready);
});

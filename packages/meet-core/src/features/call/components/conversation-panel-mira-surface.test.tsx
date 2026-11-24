// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const f = vi.hoisted(() => ({ room: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  readRoomMiraConsent: f.room,
  askPersonalMeetAssistant: vi.fn(),
}));
vi.mock('./chat-panel', () => ({ ChatPanel: () => <div>Room history</div> }));
vi.mock('./personal-chat', () => ({ PersonalChat: () => <div>Private</div> }));

import {
  clearLiveSession,
  type LiveSessionControls,
  publishLiveSession,
} from '../../live-assistant/live-session-store';
import { ConversationPanel } from './conversation-panel';

const controls = {
  start: vi.fn(),
  send: vi.fn(),
  stop: vi.fn(),
  decide: vi.fn(),
  openConsent: vi.fn(),
} satisfies LiveSessionControls;
const tab = messages.meet.call.miraEverywhere.tutor.tab;
function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConversationPanel
          solo
          chat={[]}
          meetingId="room"
          accountId="me"
          selfUserId="me"
          onSendChat={vi.fn()}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  cleanup();
  clearLiveSession(controls);
});

it('shows the Private Assistant tab while room Mira is available', async () => {
  f.room.mockResolvedValue({ available: true });
  show();
  await waitFor(() => expect(f.room).toHaveBeenCalled());
  expect(screen.getByRole('tab', { name: tab })).toBeTruthy();
});

it('keeps the tab for a Private Assistant even when room Mira is off', async () => {
  f.room.mockResolvedValue({ available: false });
  act(() =>
    publishLiveSession({
      meetingId: 'room',
      accountId: 'me',
      status: 'idle',
      mode: undefined,
      transcript: [],
      reviews: [],
      error: undefined,
      accepted: false,
      audioSuppressed: false,
      meetingMicOn: false,
      controls,
    })
  );
  show();
  await waitFor(() => expect(f.room).toHaveBeenCalled());
  expect(screen.getByRole('tab', { name: tab })).toBeTruthy();
});

it('drops the tab when there is no Private Assistant and room Mira is off', async () => {
  f.room.mockResolvedValue({ available: false });
  show();
  await waitFor(() => expect(screen.queryByRole('tab')).toBeNull());
  expect(screen.getByText('Room history')).toBeTruthy();
});

it('keeps the tab when the room Mira read fails', async () => {
  f.room.mockRejectedValue(new Error('offline'));
  show();
  await waitFor(() => expect(f.room).toHaveBeenCalled());
  expect(screen.getByRole('tab', { name: tab })).toBeTruthy();
});

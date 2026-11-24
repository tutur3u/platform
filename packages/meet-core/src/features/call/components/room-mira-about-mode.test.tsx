// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const f = vi.hoisted(() => ({ room: vi.fn(), transcript: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  readRoomMiraConsent: f.room,
  readMeetTranscriptConsent: f.transcript,
  setRoomMiraChoice: vi.fn(),
  acceptRoomMira: vi.fn(),
  turnOffRoomMira: vi.fn(),
  reportRoomMiraMinor: vi.fn(),
  setMeetTranscriptChoice: vi.fn(),
}));

import { RoomMiraNotice } from './room-mira-notice';

const m = messages.meet.mira_consent;
const accepted = {
  available: true,
  version: 'v',
  acceptance: {
    revision: 3,
    acceptorName: 'Lan',
    capabilities: ['chat'],
    acceptedAt: 0,
  },
  choice: 'on',
  lastChoice: null,
  pausing: false,
  ready: true,
  canAccept: false,
  status: { active: true, included: 1, admitted: 2 },
  boxTickedByDefault: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
});
afterEach(cleanup);

it.each([
  ['room', m.info_off, m.info_off_self],
  ['self', m.info_off_self, m.info_off],
] as const)(
  'About Mira shows the %s notice the choice is hashed over',
  async (mode, shown, hidden) => {
    f.room.mockResolvedValue(accepted);
    f.transcript.mockResolvedValue({ available: true, mode });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={messages}>
          <RoomMiraNotice meetingId="room" />
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Mira is on, turned on by Lan/,
      })
    );
    fireEvent.click(await screen.findByRole('button', { name: m.about }));
    // The mode is known only once the room read settles.
    expect(await screen.findByText(shown)).toBeTruthy();
    expect(screen.queryByText(hidden)).toBeNull();
  }
);

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import vi_messages from '../../../../../../apps/meet/messages/vi.json';

const f = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  readRoomMiraConsent: f.read,
  setRoomMiraChoice: vi.fn(),
  acceptRoomMira: vi.fn(),
  turnOffRoomMira: vi.fn(),
  reportRoomMiraMinor: vi.fn(),
}));

import {
  clearLiveSession,
  type LiveSessionControls,
  type LiveSessionSnapshot,
  publishLiveSession,
  readLiveVoice,
  setLiveVoice,
} from '../../live-assistant/live-session-store';
import { RoomMiraNotice } from './room-mira-notice';

const base = {
  available: true,
  version: 'v',
  acceptance: null,
  choice: null,
  lastChoice: null,
  pausing: false,
  ready: false,
  canAccept: false,
  status: { active: false, included: 0, admitted: 2 },
  boxTickedByDefault: true,
};
const accepted = {
  ...base,
  acceptance: {
    revision: 3,
    acceptorName: 'Lan',
    capabilities: ['chat'],
    acceptedAt: 0,
  },
  choice: 'on',
  status: { active: true, included: 1, admitted: 2 },
};
const controls = {
  start: vi.fn(),
  send: vi.fn(),
  stop: vi.fn(),
  decide: vi.fn(),
  openConsent: vi.fn(),
} satisfies LiveSessionControls;
function session(status = 'idle'): LiveSessionSnapshot {
  return {
    meetingId: 'room',
    accountId: 'me',
    status,
    mode: undefined,
    transcript: [],
    reviews: [],
    error: undefined,
    accepted: false,
    audioSuppressed: false,
    meetingMicOn: false,
    controls,
  };
}
function show(locale: 'en' | 'vi' = 'en') {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'en' ? messages : vi_messages}
      >
        <RoomMiraNotice meetingId="room" accountId="me" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  setLiveVoice('Aoede');
});
afterEach(() => {
  cleanup();
  clearLiveSession(controls);
});

it('opens the Private Assistant from the one header control', async () => {
  f.read.mockResolvedValue(accepted);
  act(() => publishLiveSession(session()));
  show();
  const control = await screen.findByRole('button', {
    name: /Mira is on, turned on by Lan/,
  });
  fireEvent.click(control);
  fireEvent.click(
    await screen.findByRole('button', {
      name: messages.meet.live.open_private,
    })
  );
  expect(controls.openConsent).toHaveBeenCalledTimes(1);
  // Focus is back on the control, so the dialog restores it on close.
  expect(document.activeElement).toBe(control);
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: messages.meet.live.open_private })
    ).toBeNull()
  );
});

it('sets Mira’s voice from the control until a session is live', async () => {
  f.read.mockResolvedValue(accepted);
  act(() => publishLiveSession(session()));
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: /Mira is on, turned on by Lan/ })
  );
  const voice = await screen.findByRole('combobox', {
    name: messages.meet.live.voice,
  });
  expect(voice.hasAttribute('disabled')).toBe(false);
  expect(readLiveVoice()).toBe('Aoede');
  act(() => setLiveVoice('Kore'));
  expect(readLiveVoice()).toBe('Kore');
  act(() => publishLiveSession(session('listening')));
  await waitFor(() =>
    expect(
      screen
        .getByRole('combobox', { name: messages.meet.live.voice })
        .hasAttribute('disabled')
    ).toBe(true)
  );
});

it('stays the only entry for someone who cannot turn room Mira on', async () => {
  f.read.mockResolvedValue(base);
  act(() => publishLiveSession(session()));
  show();
  const control = await screen.findByRole('button', {
    name: messages.meet.live.title,
  });
  expect(control.textContent).not.toContain('18+');
  fireEvent.click(control);
  fireEvent.click(
    await screen.findByRole('button', {
      name: messages.meet.live.open_private,
    })
  );
  expect(controls.openConsent).toHaveBeenCalledTimes(1);
});

it('shows no entry without a Private Assistant or a way to turn Mira on', async () => {
  f.read.mockResolvedValue(base);
  show();
  await waitFor(() => expect(f.read).toHaveBeenCalled());
  expect(screen.queryByRole('button')).toBeNull();
});

it('has the entry label in Vietnamese', () => {
  expect(vi_messages.meet.live.open_private).toBe('Mở trợ lý riêng');
});

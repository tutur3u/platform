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
function show(
  locale: 'en' | 'vi' = 'en',
  privateUsers?: { userId: string; displayName: string }[]
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'en' ? messages : vi_messages}
      >
        <RoomMiraNotice
          meetingId="room"
          accountId="me"
          privateUsers={privateUsers}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return client;
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

it('shows the host the Turn on Mira panel and the Private Assistant entry together', async () => {
  f.read.mockResolvedValue({ ...base, canAccept: true });
  act(() => publishLiveSession(session()));
  show();
  fireEvent.click(
    await screen.findByRole('button', {
      name: messages.meet.mira_consent.host_turn_on,
    })
  );
  expect(
    await screen.findByRole('button', {
      name: messages.meet.mira_consent.host_confirm,
    })
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: messages.meet.live.open_private })
  );
  expect(controls.openConsent).toHaveBeenCalledTimes(1);
});

it('keeps the control while room Mira is unavailable, so the creator can reach the assistant', async () => {
  f.read.mockResolvedValue({ available: false });
  act(() => publishLiveSession(session()));
  show();
  const control = await screen.findByRole('button', {
    name: messages.meet.live.title,
  });
  fireEvent.click(control);
  fireEvent.click(
    await screen.findByRole('button', {
      name: messages.meet.live.open_private,
    })
  );
  expect(controls.openConsent).toHaveBeenCalledTimes(1);
});

it('starts the popover with the assistant entry, with no empty section above it', async () => {
  f.read.mockResolvedValue({ available: false });
  act(() => publishLiveSession(session()));
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: messages.meet.live.title })
  );
  const panel = await screen.findByRole('dialog');
  const open = screen.getByRole('button', {
    name: messages.meet.live.open_private,
  });
  expect(panel.firstElementChild?.contains(open)).toBe(true);
  expect(panel.firstElementChild?.className).toContain('first:border-t-0');
});

it('keeps the control when the room Mira read fails', async () => {
  f.read.mockRejectedValue(new Error('offline'));
  act(() => publishLiveSession(session()));
  show();
  expect(
    await screen.findByRole('button', { name: messages.meet.live.title })
  ).toBeTruthy();
});

const lan = [{ userId: 'u1', displayName: 'Lan' }];
const indicator =
  'Lan is using Mira privately; it hears only their microphone.';

it('tells a guest without a Private Assistant who is using Mira privately', async () => {
  f.read.mockResolvedValue({ available: false });
  show('en', lan);
  fireEvent.click(
    await screen.findByRole('button', { name: messages.meet.live.title })
  );
  expect((await screen.findByRole('status')).textContent).toBe(indicator);
  expect(
    screen.queryByRole('button', { name: messages.meet.live.open_private })
  ).toBeNull();
});

it('tells a member with room Mira off who is using Mira privately', async () => {
  f.read.mockResolvedValue(base);
  act(() => publishLiveSession(session()));
  show('en', lan);
  fireEvent.click(
    await screen.findByRole('button', { name: messages.meet.live.title })
  );
  expect((await screen.findByRole('status')).textContent).toBe(indicator);
});

it('tells the host who is using Mira privately before room Mira is on', async () => {
  f.read.mockResolvedValue({ ...base, canAccept: true });
  show('en', lan);
  fireEvent.click(
    await screen.findByRole('button', {
      name: messages.meet.mira_consent.host_turn_on,
    })
  );
  expect((await screen.findByRole('status')).textContent).toBe(indicator);
});

it('leaves focus with the assistant dialog when the popover closes', async () => {
  f.read.mockResolvedValue(accepted);
  const dialog = document.createElement('button');
  dialog.textContent = 'dialog';
  document.body.append(dialog);
  controls.openConsent.mockImplementation(() => dialog.focus());
  act(() => publishLiveSession(session()));
  show();
  fireEvent.click(
    await screen.findByRole('button', { name: /Mira is on, turned on by Lan/ })
  );
  fireEvent.click(
    await screen.findByRole('button', { name: messages.meet.live.open_private })
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: messages.meet.live.open_private })
    ).toBeNull()
  );
  // Radix returns focus to the trigger on a timer after the popover unmounts.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(document.activeElement).toBe(dialog);
  dialog.remove();
});

it('opens again for a new acceptance the person has not answered', async () => {
  f.read.mockResolvedValue({ ...accepted, choice: null });
  const client = show();
  const confirm = () =>
    screen.queryByRole('button', { name: messages.meet.mira_consent.confirm });
  expect(
    await screen.findByRole('button', {
      name: messages.meet.mira_consent.confirm,
    })
  ).toBeTruthy();
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  await waitFor(() => expect(confirm()).toBeNull());
  act(() =>
    client.setQueryData(['room-mira-consent', 'room'], {
      ...accepted,
      choice: null,
      acceptance: { ...accepted.acceptance, revision: 4 },
    })
  );
  expect(
    await screen.findByRole('button', {
      name: messages.meet.mira_consent.confirm,
    })
  ).toBeTruthy();
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

// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
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
function show(details?: ReactNode) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <RoomMiraNotice meetingId="room" details={details} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
const chipButton = (name: string) => screen.findByRole('button', { name });
const openDetails = async (name: string) => {
  fireEvent.click(await chipButton(name));
  return screen.findByRole('dialog');
};
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
  // The chat holds one chip; the prompt, the 18+ rule and the choice open from it.
  const chip = await chipButton(
    `${call.room_mira_chip_choose} ${call.room_mira_details}`
  );
  expect(screen.queryByText(call.room_mira_prompt)).toBeNull();
  expect(
    screen.queryByRole('button', { name: call.room_mira_continue })
  ).toBeNull();
  fireEvent.click(chip);
  await screen.findByText(call.room_mira_prompt);
  // The 18+ rule is part of what Continue accepts.
  const proceed = screen.getByRole('button', { name: call.room_mira_continue });
  expect(
    document.getElementById(proceed.getAttribute('aria-describedby') ?? '')
      ?.textContent
  ).toBe(messages.meet.mira_adults.consent);
  fireEvent.click(proceed);
  await screen.findByText('Waiting for 1 person to choose Continue.');
  expect(chip.textContent).toContain('Mira · waiting for 1');
  expect(screen.queryByText(messages.meet.mira_adults.consent)).toBeNull();
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
  await openDetails(`${call.room_mira_chip_ready} ${call.room_mira_details}`);
  await screen.findByText(call.room_mira_ready);
});

it('shows Pausing… until already-admitted sends settle, then the effective Pause', async () => {
  const continuing = {
    available: true,
    version,
    choice: 'continue',
    pausing: false,
    fence: { ready: true, pending: 0, admitted: 2 },
  };
  const pausing = {
    ...continuing,
    pausing: true,
    fence: { ready: false, pending: 1, admitted: 2 },
  };
  const paused = { ...pausing, choice: 'mute', pausing: false };
  f.read.mockResolvedValue(continuing);
  f.choose.mockResolvedValue(pausing);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <RoomMiraNotice meetingId="room" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const dialog = await openDetails(
    `${call.room_mira_chip_ready} ${call.room_mira_details}`
  );
  await within(dialog).findByText(call.room_mira_ready);
  fireEvent.click(
    within(dialog).getByRole('button', { name: call.room_mira_pause })
  );
  await vi.waitFor(() =>
    expect(f.choose).toHaveBeenCalledWith('room', 'mute', version)
  );
  const status = await screen.findByText(call.room_mira_pausing);
  expect(status.closest('[role="status"]')).toBeTruthy();
  // No choice can be made while the Pause is settling.
  expect(within(dialog).queryByRole('button')).toBeNull();
  // The room makes the Pause effective once the admitted sends settle.
  f.read.mockResolvedValue(paused);
  await client.refetchQueries();
  await screen.findByText(call.room_mira_paused);
  expect(screen.queryByText(call.room_mira_pausing)).toBeNull();
  expect(
    within(dialog).getByRole('button', { name: call.room_mira_continue })
  ).toBeTruthy();
});

it('keeps the consent terms, progress and host-set capabilities in the popover', async () => {
  f.read.mockResolvedValue({
    available: true,
    version,
    choice: 'continue',
    fence: { ready: false, pending: 2, admitted: 3 },
  });
  show(<p>host-set capabilities</p>);
  const chip = await chipButton(
    `Mira · waiting for 2 ${call.room_mira_details}`
  );
  // The chat shows the one line: no 18+ note, controls, progress or capabilities.
  expect(screen.queryByText(messages.meet.mira_adults.notice)).toBeNull();
  expect(screen.queryByText('host-set capabilities')).toBeNull();
  expect(screen.queryByText('1/3')).toBeNull();
  expect(chip.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(chip);
  const dialog = await screen.findByRole('dialog', {
    name: call.room_mira_title,
  });
  expect(chip.getAttribute('aria-expanded')).toBe('true');
  expect(
    within(dialog).getByText(messages.meet.mira_adults.notice)
  ).toBeTruthy();
  expect(within(dialog).getByText('1/3')).toBeTruthy();
  expect(within(dialog).getByText('host-set capabilities')).toBeTruthy();
  expect(
    within(dialog).getByRole('button', { name: call.room_mira_pause })
  ).toBeTruthy();
  // Continue was already chosen, so it is not offered again.
  expect(
    within(dialog).queryByRole('button', { name: call.room_mira_continue })
  ).toBeNull();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('puts the host-set capabilities behind a chip when room Mira is unavailable', async () => {
  f.read.mockResolvedValue({ available: false });
  show(<p>host-set capabilities</p>);
  await openDetails(
    `${messages.meet.call.miraEverywhere.permissions.title} ${call.room_mira_details}`
  );
  expect(screen.getByText('host-set capabilities')).toBeTruthy();
});

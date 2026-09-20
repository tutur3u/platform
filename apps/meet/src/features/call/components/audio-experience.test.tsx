// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en.json';
import type { MeetRoomController } from '../lib/room-controller';
import { AdmissionNotice } from './admission-notice';
import { MicrophoneRecovery } from './microphone-recovery';

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
afterEach(cleanup);
it('shows host admission status ahead of a simultaneous reconnect state', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AdmissionNotice waiting connecting />
    </NextIntlClientProvider>
  );
  expect(screen.getByRole('status').textContent).toContain(
    'Waiting for the host'
  );
  expect(screen.getByRole('status').textContent).toContain(
    'The host has been notified'
  );
  expect(screen.queryByText('Connecting')).toBeNull();
});
it('reacquires the selected microphone before reconnecting transport', async () => {
  const selectDevice = vi.fn().mockResolvedValue(undefined);
  const reconnectMedia = vi.fn();
  const room = {
    media: { audioEnabled: true },
    selectDevice,
    reconnectMedia,
    getSelectedDevices: () => ({ audio: 'selected-mic' }),
  } as unknown as MeetRoomController;
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MicrophoneRecovery room={room} />
    </NextIntlClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Restart microphone' }));
  await waitFor(() => expect(reconnectMedia).toHaveBeenCalledOnce());
  expect(selectDevice).toHaveBeenCalledWith('audio', 'selected-mic');
  expect(selectDevice.mock.invocationCallOrder[0]).toBeLessThan(
    reconnectMedia.mock.invocationCallOrder[0]!
  );
  room.media.audioEnabled = false;
  view.rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MicrophoneRecovery room={room} />
    </NextIntlClientProvider>
  );
  expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
});

it('localizes date-only and time-only meeting metadata without duplicating them', async () => {
  const { MeetingLocalTime } = await import('./meeting-local-time');
  const value = '2026-09-20T13:21:00Z';
  const { container } = render(
    <NextIntlClientProvider locale="vi" messages={messages}>
      <MeetingLocalTime value={value} pattern="PPP" />
      <MeetingLocalTime value={value} pattern="p" />
    </NextIntlClientProvider>
  );
  const labels = [...container.querySelectorAll('time')].map(
    (time) => time.textContent
  );
  expect(labels[0]).toBe(
    new Intl.DateTimeFormat('vi', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(value))
  );
  expect(labels[1]).toBe(
    new Intl.DateTimeFormat('vi', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  );
  expect(labels[1]).not.toContain('2026');
});

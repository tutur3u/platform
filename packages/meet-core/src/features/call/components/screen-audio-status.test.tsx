// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../../apps/meet/messages/vi.json';
import { PENDING_AUDIO_MS, ScreenAudioStatus } from './screen-audio-status';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function track(kind: string, extra: Record<string, unknown> = {}) {
  const listeners = new Set<() => void>();
  return {
    addEventListener: (_event: string, listener: () => void) =>
      listeners.add(listener),
    enabled: true,
    kind,
    muted: false,
    readyState: 'live',
    removeEventListener: (_event: string, listener: () => void) =>
      listeners.delete(listener),
    emit: () => listeners.forEach((listener) => listener()),
    ...extra,
  };
}

function stream(displaySurface: string, withAudio: boolean) {
  const video = track('video', { getSettings: () => ({ displaySurface }) });
  const audio = withAudio ? [track('audio')] : [];
  return {
    getAudioTracks: () => audio,
    getTracks: () => [video, ...audio],
    getVideoTracks: () => [video],
  } as unknown as MediaStream;
}

function show(value: MediaStream, locale = 'en') {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'vi' ? viMessages : messages}
    >
      <ScreenAudioStatus stream={value} />
    </NextIntlClientProvider>
  );
}

it('shows no explanation while audio is shared', () => {
  show(stream('monitor', true));
  expect(screen.getByRole('status').textContent).toBe(
    messages.meet.call.screen_audio_on
  );
});

it('explains a whole-screen share without audio in one text for every cause', () => {
  show(stream('monitor', false));
  const status = screen.getByRole('status');
  expect(status.textContent).toBe(
    messages.meet.call.screen_audio_off +
      messages.meet.call.screen_audio_reason_system_audio_off
  );
});

it('explains a whole-screen share without audio in Vietnamese', () => {
  show(stream('monitor', false), 'vi');
  expect(screen.getByRole('status').textContent).toBe(
    viMessages.meet.call.screen_audio_off +
      viMessages.meet.call.screen_audio_reason_system_audio_off
  );
});

it('explains a tab share without audio in each language', () => {
  show(stream('browser', false));
  expect(screen.getByRole('status').textContent).toBe(
    messages.meet.call.screen_audio_off +
      messages.meet.call.screen_audio_reason_tab_audio_off
  );
  cleanup();
  show(stream('browser', false), 'vi');
  expect(screen.getByRole('status').textContent).toBe(
    viMessages.meet.call.screen_audio_off +
      viMessages.meet.call.screen_audio_reason_tab_audio_off
  );
});

it('explains a window share without audio', () => {
  show(stream('window', false));
  expect(screen.getByRole('status').textContent).toBe(
    messages.meet.call.screen_audio_off +
      messages.meet.call.screen_audio_reason_window_audio_unavailable
  );
});

it('claims nothing while the audio track is muted, then reports sharing once it delivers', () => {
  const value = stream('monitor', true);
  const audio = value.getAudioTracks()[0] as unknown as {
    emit: () => void;
    muted: boolean;
  };
  audio.muted = true;
  show(value);
  expect(screen.queryByRole('status')).toBeNull();
  audio.muted = false;
  act(() => audio.emit());
  expect(screen.getByRole('status').textContent).toBe(
    messages.meet.call.screen_audio_on
  );
});

it('falls back to the no-audio explanation after the track stays muted, and restarts the wait on a change', () => {
  vi.useFakeTimers();
  const value = stream('monitor', true);
  const audio = value.getAudioTracks()[0] as unknown as {
    emit: () => void;
    muted: boolean;
  };
  audio.muted = true;
  show(value);
  act(() => vi.advanceTimersByTime(PENDING_AUDIO_MS - 1000));
  expect(screen.queryByRole('status')).toBeNull();
  // Unmuting and muting again restarts the wait.
  audio.muted = false;
  act(() => audio.emit());
  audio.muted = true;
  act(() => audio.emit());
  act(() => vi.advanceTimersByTime(PENDING_AUDIO_MS - 1000));
  expect(screen.queryByRole('status')).toBeNull();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole('status').textContent).toBe(
    messages.meet.call.screen_audio_off +
      messages.meet.call.screen_audio_reason_system_audio_off
  );
});

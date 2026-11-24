// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import vi from '../../../../../../apps/meet/messages/vi.json';
import { ScreenAudioStatus } from './screen-audio-status';

afterEach(cleanup);

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
      messages={locale === 'vi' ? vi : messages}
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
    vi.meet.call.screen_audio_off +
      vi.meet.call.screen_audio_reason_system_audio_off
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
    vi.meet.call.screen_audio_off +
      vi.meet.call.screen_audio_reason_tab_audio_off
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

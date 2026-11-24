// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import vi from '../../../../../../apps/meet/messages/vi.json';
import { ScreenAudioStatus } from './screen-audio-status';

afterEach(cleanup);

function track(kind: string, extra: Record<string, unknown> = {}) {
  return {
    addEventListener: () => {},
    enabled: true,
    kind,
    muted: false,
    readyState: 'live',
    removeEventListener: () => {},
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

it('explains a whole-screen share without system audio', () => {
  show(stream('monitor', false));
  const status = screen.getByRole('status');
  expect(status.textContent).toContain(messages.meet.call.screen_audio_off);
  expect(status.textContent).toMatch(
    new RegExp(
      [
        messages.meet.call.screen_audio_reason_system_audio_off,
        messages.meet.call.screen_audio_reason_system_audio_unsupported,
      ]
        .map((text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
        .join('|'),
      'u'
    )
  );
});

it('explains a tab share without audio in Vietnamese', () => {
  show(stream('browser', false), 'vi');
  expect(screen.getByRole('status').textContent).toContain(
    vi.meet.call.screen_audio_reason_tab_audio_off
  );
});

import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { ParticipantTile } from './participant-tile';

const participant = {
  userId: 'peer',
  displayName: 'Peer',
  media: { audioEnabled: true, videoEnabled: false, screenEnabled: false },
} as MeetRealtimePresence;
function renderTile(props: ComponentProps<typeof ParticipantTile>) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantTile {...props} />
    </NextIntlClientProvider>
  );
}
describe('participant media markup', () => {
  it('keeps audio separate from a muted video element when the camera is off', () => {
    const html = renderTile({ participant, resumePlaybackLabel: 'Play audio' });
    expect(html).toContain('<video');
    expect(html.match(/<audio[^>]*>/u)?.[0]).not.toContain('muted');
    expect(html.match(/<video[^>]*>/u)?.[0]).toContain('muted');
    expect(html.match(/<video[^>]*>/u)?.[0]).not.toContain('hidden');
  });
  it('mutes the local preview to prevent feedback', () => {
    expect(
      renderTile({
        participant,
        isSelf: true,
        resumePlaybackLabel: 'Play audio',
      })
    ).toContain('muted=""');
  });
  it('fits camera and shared screens without cropping', () => {
    for (const kind of ['camera', 'screen'] as const) {
      const html = renderTile({
        participant,
        kind,
        focused: true,
        resumePlaybackLabel: 'Play audio',
      });
      expect(html).toContain('object-contain');
      expect(html.match(/<video[^>]*>/u)?.[0]).not.toContain('object-cover');
    }
  });
});

it('plays remote screen audio and exposes host mute only on remote cameras', () => {
  const common = {
    participant,
    resumePlaybackLabel: 'Play audio',
    onMute: () => undefined,
  };
  expect(
    renderTile({ ...common, kind: 'screen' }).match(/<audio[^>]*>/u)?.[0]
  ).not.toContain('muted');
  expect(renderTile(common)).toContain('Mute Peer');
  expect(renderTile({ ...common, isSelf: true })).not.toContain('Mute Peer');
  expect(renderTile({ ...common, kind: 'screen' })).not.toContain('Mute Peer');
});

it('does not duplicate the mute icon with a disabled host action', () => {
  expect(
    renderTile({
      participant: {
        ...participant,
        media: { ...participant.media, audioEnabled: false },
      },
      resumePlaybackLabel: 'Play audio',
      onMute: () => undefined,
    })
  ).not.toContain('Mute Peer');
});

it('shows a muted badge when a camera has audio off', () => {
  const html = renderTile({
    participant: {
      ...participant,
      media: { ...participant.media, audioEnabled: false },
    },
    isSelf: true,
    resumePlaybackLabel: 'Play audio',
  });
  expect(html).toContain('aria-label="Muted"');
});

it('hides mute and receive badges in a presence-only room', () => {
  const quiet = {
    ...participant,
    media: { ...participant.media, audioEnabled: false, videoEnabled: true },
  };
  const present = renderTile({
    participant: quiet,
    presenceOnly: true,
    handRaised: true,
    resumePlaybackLabel: 'Play audio',
  });
  expect(present).not.toContain('aria-label="Muted"');
  expect(present).not.toContain('Waiting for media');
  expect(present).not.toContain('Receiving video');
  expect(present).toContain('Peer');
  expect(present).toContain('Hand raised');
  const media = renderTile({
    participant: quiet,
    resumePlaybackLabel: 'Play audio',
  });
  expect(media).toContain('aria-label="Muted"');
  expect(media).toContain('Waiting for media');
});

it('uses theme-aware name bar colors on avatar tiles', () => {
  const html = renderTile({ participant, resumePlaybackLabel: 'Play audio' });
  expect(html).toContain('from-background/90');
  expect(html).toContain('text-foreground');
  expect(html).not.toContain('from-media-scrim');
});

it('keeps the self marker with a long wrapped name', () => {
  const longName = 'Alexandria Montgomery-Featherstonehaugh the Third';
  const html = renderTile({
    participant: { ...participant, displayName: longName },
    isSelf: true,
    resumePlaybackLabel: 'Play audio',
  });
  expect(html).toContain(longName);
  expect(html).toContain('· You');
  expect(html).toContain('line-clamp-2');
  expect(html).not.toContain('truncate');
});

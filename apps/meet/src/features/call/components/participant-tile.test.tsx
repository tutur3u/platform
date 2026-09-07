import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import messages from '../../../../messages/en.json';
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
  it('renders an unmuted video element when the remote camera is off', () => {
    const html = renderTile({ participant, resumePlaybackLabel: 'Play audio' });
    expect(html).toContain('<video');
    expect(html).not.toContain('muted=""');
    expect(html).toContain('hidden');
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
  expect(renderTile({ ...common, kind: 'screen' })).not.toContain('muted=""');
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

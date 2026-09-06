import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ParticipantTile } from './participant-tile';

const participant = {
  userId: 'peer',
  displayName: 'Peer',
  media: { audioEnabled: true, videoEnabled: false, screenEnabled: false },
} as MeetRealtimePresence;
describe('participant media markup', () => {
  it('renders an unmuted video element when the remote camera is off', () => {
    const html = renderToStaticMarkup(
      createElement(ParticipantTile, {
        participant,
        resumePlaybackLabel: 'Play audio',
      })
    );
    expect(html).toContain('<video');
    expect(html).not.toContain('muted=""');
    expect(html).toContain('hidden');
  });
  it('mutes the local preview to prevent feedback', () => {
    expect(
      renderToStaticMarkup(
        createElement(ParticipantTile, {
          participant,
          isSelf: true,
          resumePlaybackLabel: 'Play audio',
        })
      )
    ).toContain('muted=""');
  });
  it('fits shared screens without cropping them', () => {
    const html = renderToStaticMarkup(
      createElement(ParticipantTile, {
        resumePlaybackLabel: 'Play audio',
        participant: {
          ...participant,
          media: { ...participant.media, screenEnabled: true },
        },
      })
    );
    expect(html).toContain('object-contain');
  });
});

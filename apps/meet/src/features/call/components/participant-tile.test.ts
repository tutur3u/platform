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
describe('participant media playback', () => {
  it('retains an unmuted playback element for audio-only participants', () => {
    const html = renderToStaticMarkup(
      createElement(ParticipantTile, { participant })
    );
    expect(html).toContain('<video');
    expect(html).not.toContain('muted=""');
    expect(html).toContain('hidden');
  });
  it('mutes the local preview to prevent feedback', () => {
    expect(
      renderToStaticMarkup(
        createElement(ParticipantTile, { participant, isSelf: true })
      )
    ).toContain('muted=""');
  });
  it('fits shared screens without cropping them', () => {
    const html = renderToStaticMarkup(
      createElement(ParticipantTile, {
        participant: {
          ...participant,
          media: { ...participant.media, screenEnabled: true },
        },
      })
    );
    expect(html).toContain('object-contain');
  });
});

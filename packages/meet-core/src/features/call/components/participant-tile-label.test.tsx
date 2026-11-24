// @vitest-environment jsdom
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { ParticipantTile } from './participant-tile';

afterEach(cleanup);

class FakeStream {
  constructor(private readonly tracks: unknown[] = []) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return [];
  }
}
(globalThis as { MediaStream?: unknown }).MediaStream = FakeStream;
HTMLMediaElement.prototype.play = () => Promise.resolve();
HTMLMediaElement.prototype.pause = () => {};

it('labels tile actions with the resolved participant name on the desktop path', () => {
  const participant = {
    userId: 'peer',
    displayName: 'Dan Dinh (guest)',
    guest: true,
    media: { audioEnabled: true, videoEnabled: false, screenEnabled: false },
  } as MeetRealtimePresence;
  const stream = new FakeStream([
    {
      kind: 'audio',
      addEventListener() {},
      removeEventListener() {},
      stop() {},
    },
  ]) as unknown as MediaStream;
  const { getByLabelText, queryByLabelText } = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ParticipantTile
        participant={participant}
        resumePlaybackLabel="Play audio"
        stream={stream}
      />
    </NextIntlClientProvider>
  );
  // The flagged guest's legacy suffix is shown by the badge, not by the name.
  expect(getByLabelText('Mute Dan Dinh for me')).toBeTruthy();
  expect(queryByLabelText('Mute Dan Dinh (guest) for me')).toBeNull();
});

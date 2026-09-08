import type {
  CloudflareSfuTrack,
  MeetRealtimeRoomTrack,
} from '@tuturuuu/realtime/meet';
import { expect, it } from 'vitest';
import { listenRemotePlayback, type RemoteTrackOwner } from './remote-playback';
import type { RemoteMedia } from './remote-streams';
import {
  applySubscribeResponse,
  pruneObsoleteReceivers,
} from './subscribe-response';

const pending: CloudflareSfuTrack[] = [
  { location: 'remote', sessionId: 'new', trackName: 'peer-video' },
];
const live = {
  'new:peer-video': { ...pending[0], userId: 'peer', kind: 'video' },
} as Record<string, MeetRealtimeRoomTrack>;
it('does not bind rejected tracks even if the SFU response contains a mid', () => {
  const owners = new Map<string, RemoteTrackOwner>();
  applySubscribeResponse(
    {
      tracks: [
        { mid: '1', trackName: 'peer-video', errorCode: 'trackNotFound' },
      ],
    },
    pending,
    live,
    owners
  );
  expect(owners.size).toBe(0);
  applySubscribeResponse(
    { tracks: [{ mid: '1', trackName: 'peer-video' }] },
    pending,
    live,
    owners
  );
  expect(owners.get('1')?.subscriptionKey).toBe('new:peer-video');
});
it('ignores a response after its publisher was replaced during negotiation', () => {
  const owners = new Map<string, RemoteTrackOwner>();
  applySubscribeResponse(
    { tracks: [{ mid: '1', trackName: 'peer-video' }] },
    pending,
    {},
    owners
  );
  expect(owners.size).toBe(0);
});
it('rejects failed or incomplete negotiations for retry', () => {
  expect(() =>
    applySubscribeResponse({ errorCode: 'failed' }, pending, live, new Map())
  ).toThrow();
  expect(() =>
    applySubscribeResponse(
      { requiresImmediateRenegotiation: true },
      pending,
      live,
      new Map()
    )
  ).toThrow();
});
it('prevents delayed events from an obsolete receiver replacing current video', () => {
  const owner = {
    userId: 'peer',
    kind: 'video' as const,
    subscriptionKey: 'old:peer-video',
  };
  const owners = new Map([['0', owner]]);
  const subscribed = new Set(['old:peer-video']);
  const replacement = new EventTarget() as MediaStreamTrack;
  let media: RemoteMedia = { peer: { video: replacement } };
  const setMedia = (update: (current: RemoteMedia) => RemoteMedia) => {
    media = update(media);
  };
  const pc = Object.assign(new EventTarget(), {
    signalingState: 'stable',
  }) as unknown as RTCPeerConnection;
  listenRemotePlayback(pc, owners, subscribed, () => true, setMedia);
  pruneObsoleteReceivers(live, owners, subscribed, setMedia);
  pc.dispatchEvent(
    Object.assign(new Event('track'), {
      track: new EventTarget(),
      transceiver: { mid: '0' },
    })
  );
  expect(media.peer?.video).toBe(replacement);
  expect(subscribed.size).toBe(0);
});

it('rejects a track name claiming another participant identity', () => {
  const owners = new Map<string, RemoteTrackOwner>();
  applySubscribeResponse(
    { tracks: [{ mid: '1', trackName: 'peer-video' }] },
    pending,
    { 'new:peer-video': { ...live['new:peer-video']!, userId: 'different' } },
    owners
  );
  expect(owners.size).toBe(0);
});

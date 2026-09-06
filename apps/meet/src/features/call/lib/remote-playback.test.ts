import { describe, expect, it } from 'vitest';
import { planRemoteSubscriptions } from './negotiation';
import { attachRemotePlayback, type RemoteTrackOwner } from './remote-playback';
import type { RemoteMedia } from './remote-streams';

const roomTrack = {
  kind: 'audio',
  sessionId: 'publisher',
  trackName: 'other-audio',
  userId: 'other',
};
const key = 'publisher:other-audio';
function fixture() {
  let media: RemoteMedia = {};
  const subscribed = new Set([key]);
  const owner: RemoteTrackOwner = {
    userId: 'other',
    kind: 'audio',
    subscriptionKey: key,
  };
  const setMedia = (update: (current: RemoteMedia) => RemoteMedia) => {
    media = update(media);
  };
  return { owner, subscribed, setMedia, media: () => media };
}
function fakeTrack() {
  return new EventTarget() as MediaStreamTrack;
}

describe('ended remote playback', () => {
  it('immediately releases a track that ended before attachment', () => {
    const f = fixture();
    const track = fakeTrack();
    Object.defineProperty(track, 'readyState', { value: 'ended' });
    attachRemotePlayback(f.owner, track, f.subscribed, () => true, f.setMedia);
    expect(f.media()).toEqual({});
    expect(f.subscribed.has(key)).toBe(false);
  });

  it('makes an advertised track eligible for the next subscription retry', () => {
    const f = fixture();
    const track = fakeTrack();
    attachRemotePlayback(f.owner, track, f.subscribed, () => true, f.setMedia);
    expect(
      planRemoteSubscriptions({ [key]: roomTrack }, f.subscribed, 'self')
    ).toEqual([]);
    track.dispatchEvent(new Event('ended'));
    expect(f.media()).toEqual({});
    expect(
      planRemoteSubscriptions({ [key]: roomTrack }, f.subscribed, 'self')
    ).toHaveLength(1);
  });

  it('does not clear replacement playback when the prior track ends', () => {
    const f = fixture();
    const old = fakeTrack();
    const replacement = fakeTrack();
    attachRemotePlayback(f.owner, old, f.subscribed, () => true, f.setMedia);
    attachRemotePlayback(
      f.owner,
      replacement,
      f.subscribed,
      () => true,
      f.setMedia
    );
    old.dispatchEvent(new Event('ended'));
    expect(f.subscribed.has(key)).toBe(true);
    expect(f.media().other?.audio).toBe(replacement);
  });

  it('ignores ended events from an obsolete peer connection', () => {
    const f = fixture();
    const track = fakeTrack();
    attachRemotePlayback(f.owner, track, f.subscribed, () => false, f.setMedia);
    track.dispatchEvent(new Event('ended'));
    expect(f.subscribed.has(key)).toBe(true);
  });
});

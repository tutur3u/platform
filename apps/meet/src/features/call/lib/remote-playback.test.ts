import { describe, expect, it } from 'vitest';
import { planRemoteSubscriptions } from './negotiation';
import {
  attachRemotePlayback,
  type RemoteTrackOwner,
  reconcileRemotePlayback,
  releaseClosedSubscriptions,
  removeRemotePlayback,
} from './remote-playback';
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
    expect(f.owner.track).toBeUndefined();
    expect(f.media()).toEqual({});
  });

  it('ignores queued playback updates after the connection is replaced', () => {
    const f = fixture();
    let current = true;
    let queued: ((media: RemoteMedia) => RemoteMedia) | undefined;
    attachRemotePlayback(
      f.owner,
      fakeTrack(),
      f.subscribed,
      () => current,
      (update) => {
        queued = update;
      }
    );
    current = false;
    const replacement: RemoteMedia = { other: { audio: fakeTrack() } };
    expect(queued?.(replacement)).toBe(replacement);
  });
});

it('clears closed playback without removing a replacement track', () => {
  const f = fixture();
  const old = fakeTrack();
  attachRemotePlayback(f.owner, old, f.subscribed, () => true, f.setMedia);
  expect(removeRemotePlayback(f.media(), f.owner)).toEqual({});
  const replacement = { other: { audio: fakeTrack() } };
  expect(removeRemotePlayback(replacement, f.owner)).toBe(replacement);
});

it('preserves other participants on departure and restarts only overlapping offers', () => {
  const left = {
    userId: 'left',
    kind: 'audio' as const,
    subscriptionKey: 'left:audio',
    track: fakeTrack(),
  };
  const staying = {
    userId: 'staying',
    kind: 'audio' as const,
    subscriptionKey: 'staying:audio',
    track: fakeTrack(),
  };
  let media: RemoteMedia = {
    left: { audio: left.track },
    staying: { audio: staying.track },
  };
  const owners = new Map([
    ['0', left],
    ['1', staying],
  ]);
  const subscribed = new Set(['left:audio', 'staying:audio']);
  const update = (fn: (current: RemoteMedia) => RemoteMedia) => {
    media = fn(media);
  };
  expect(
    releaseClosedSubscriptions(
      new Set(['left:audio']),
      owners,
      subscribed,
      new Set(['staying:audio']),
      update
    )
  ).toBe(false);
  expect(media).toEqual({ staying: { audio: staying.track } });
  expect([...owners.keys()]).toEqual(['1']);
  expect([...subscribed]).toEqual(['staying:audio']);
  expect(
    releaseClosedSubscriptions(
      new Set(['pending:audio']),
      owners,
      subscribed,
      new Set(['pending:audio']),
      update
    )
  ).toBe(true);
});

describe('negotiated receiver reconciliation', () => {
  function receiverFixture(readyState: 'live' | 'ended' = 'live') {
    const f = fixture();
    f.subscribed.clear();
    const track = fakeTrack();
    Object.defineProperty(track, 'readyState', { value: readyState });
    const owners = new Map([['0', f.owner]]);
    const pc = {
      getTransceivers: () => [{ mid: '0', receiver: { track } }],
    } as unknown as RTCPeerConnection;
    return { ...f, track, owners, pc };
  }

  it('attaches a reused live receiver even without a new track event', () => {
    const f = receiverFixture();
    reconcileRemotePlayback(
      f.pc,
      f.owners,
      f.subscribed,
      () => true,
      f.setMedia
    );
    expect(f.media().other?.audio).toBe(f.track);
    expect(f.subscribed.has(key)).toBe(true);
    f.track.dispatchEvent(new Event('ended'));
    expect(f.media()).toEqual({});
    expect(f.subscribed.has(key)).toBe(false);
  });

  it('keeps an ended or unattached receiver eligible for retry', () => {
    const f = receiverFixture('ended');
    reconcileRemotePlayback(
      f.pc,
      f.owners,
      f.subscribed,
      () => true,
      f.setMedia
    );
    expect(f.owner.track).toBeUndefined();
    expect(f.subscribed.has(key)).toBe(false);
    expect(
      planRemoteSubscriptions({ [key]: roomTrack }, f.subscribed, 'self')
    ).toHaveLength(1);
  });

  it('ignores an obsolete connection', () => {
    const f = receiverFixture();
    reconcileRemotePlayback(
      f.pc,
      f.owners,
      f.subscribed,
      () => false,
      f.setMedia
    );
    expect(f.media()).toEqual({});
    expect(f.subscribed.size).toBe(0);
  });

  it('does not reattach an already attached receiver', () => {
    const f = receiverFixture();
    attachRemotePlayback(
      f.owner,
      f.track,
      f.subscribed,
      () => true,
      f.setMedia
    );
    let updates = 0;
    reconcileRemotePlayback(
      f.pc,
      f.owners,
      f.subscribed,
      () => true,
      () => {
        updates++;
      }
    );
    expect(updates).toBe(0);
    expect(f.subscribed.has(key)).toBe(true);
  });
});

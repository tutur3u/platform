import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { describe, expect, it } from 'vitest';
import { createReceiverHealthCheck } from './receiver-health';
import { receiverPacketState } from './receiver-packet-state';
import type { RemoteTrackOwner } from './remote-playback';

function fixture() {
  const track = Object.assign(new EventTarget(), {
    id: 'video',
    muted: true,
    readyState: 'live',
  });
  const pc = {
    getTransceivers: () => [{ mid: '0', receiver: { track } }],
  } as unknown as RTCPeerConnection;
  const owners = new Map<string, RemoteTrackOwner>([
    ['0', { userId: 'peer', kind: 'video', subscriptionKey: 'session:video' }],
  ]);
  const participants = {
    peer: {
      media: { videoEnabled: true, audioEnabled: true, screenEnabled: true },
    },
  } as unknown as Record<string, MeetRealtimePresence>;
  const check = createReceiverHealthCheck();
  const sample = (
    time: number,
    bytes: unknown = 0,
    report = true,
    options: {
      frames?: number;
      otherInbound?: boolean;
      siblingBytes?: number;
    } = {}
  ) =>
    check(
      pc,
      new Map([
        ...(report
          ? [
              [
                'in',
                {
                  type: 'inbound-rtp',
                  mid: '0',
                  bytesReceived: bytes,
                  framesDecoded: options.frames,
                },
              ],
            ]
          : []),
        ...(options.otherInbound
          ? [
              [
                'audio',
                {
                  type: 'inbound-rtp',
                  mid: '1',
                  bytesReceived: options.siblingBytes ?? 100,
                },
              ],
            ]
          : []),
      ] as Array<[string, object]>) as unknown as RTCStatsReport,
      owners,
      participants,
      time
    );
  return { track, owners, participants, sample };
}
describe('receiving health', () => {
  it('detects a connected receiver that never receives packets after the grace period', () => {
    const f = fixture();
    expect(f.sample(0)).toBe(false);
    expect(f.sample(19_999)).toBe(false);
    expect(f.sample(20_000)).toBe(true);
  });
  it('restarts the grace period when packets arrive', () => {
    const f = fixture();
    f.sample(0);
    expect(f.sample(19_000, 100)).toBe(false);
    expect(f.sample(21_000, 100)).toBe(false);
    expect(f.sample(40_000, 100)).toBe(true);
  });
  it('does not reconnect quiet audio or a static screen that has received data', () => {
    const f = fixture();
    f.track.muted = false;
    f.sample(0, 200);
    expect(f.sample(90_000, 200)).toBe(false);
  });
  it('ignores disabled media and missing stats', () => {
    const f = fixture();
    f.sample(0);
    f.participants.peer!.media.videoEnabled = false;
    expect(f.sample(30_000)).toBe(false);
    f.participants.peer!.media.videoEnabled = true;
    expect(f.sample(40_000, 0, false)).toBe(false);
    expect(f.sample(50_000)).toBe(false);
  });
  it('starts a new grace period for a replacement publisher session', () => {
    const f = fixture();
    f.sample(0);
    f.owners.get('0')!.subscriptionKey = 'new:video';
    expect(f.sample(30_000)).toBe(false);
  });
});

it('ignores unavailable, non-finite, and negative byte counters without retaining stale observations', () => {
  for (const value of [null, '0', Number.NaN, Infinity, -1]) {
    const f = fixture();
    f.sample(0);
    expect(f.sample(30_000, value)).toBe(false);
    expect(f.sample(40_000, 0)).toBe(false);
  }
});
it('does not recover intentionally ended shared audio', () => {
  const f = fixture();
  f.owners.get('0')!.kind = 'screen_audio';
  f.sample(0);
  f.track.readyState = 'ended';
  expect(f.sample(30_000)).toBe(false);
});

it('reports zero-packet receivers as waiting even when the track is unmuted', () => {
  const f = fixture();
  f.track.muted = false;
  f.sample(0);
  expect(receiverPacketState(f.track as unknown as MediaStreamTrack)).toBe(
    false
  );
  f.sample(1000, 100);
  expect(receiverPacketState(f.track as unknown as MediaStreamTrack)).toBe(
    true
  );
  f.sample(2000, null);
  expect(
    receiverPacketState(f.track as unknown as MediaStreamTrack)
  ).toBeUndefined();
});

it('requires fresh packets after a participant re-enables the same receiver', () => {
  const f = fixture();
  f.track.muted = false;
  const track = f.track as unknown as MediaStreamTrack;
  f.sample(0, 200);
  expect(receiverPacketState(track)).toBe(true);
  f.participants.peer!.media.videoEnabled = false;
  f.sample(1000, 200);
  expect(receiverPacketState(track)).toBe(false);
  f.participants.peer!.media.videoEnabled = true;
  f.sample(2000, 200);
  expect(receiverPacketState(track)).toBe(false);
  expect(f.sample(22_000, 200)).toBe(false);
  f.sample(23_000, 300);
  expect(receiverPacketState(track)).toBe(true);
});

for (const kind of ['audio', 'video', 'screen', 'screen_audio'] as const) {
  it(`does not rebuild an unmuted resumed ${kind} with prior packets but still recovers a muted receiver`, () => {
    const f = fixture();
    f.owners.get('0')!.kind = kind;
    f.track.muted = false;
    f.sample(0, 200);
    const media = f.participants.peer!.media;
    media.audioEnabled = media.videoEnabled = media.screenEnabled = false;
    f.sample(1000, 200);
    media.audioEnabled = media.videoEnabled = media.screenEnabled = true;
    f.sample(2000, 200);
    expect(f.sample(22_000, 200)).toBe(false);
    f.track.muted = true;
    expect(f.sample(23_000, 200)).toBe(true);
  });
}

it('recovers missing video RTP reports while another track proves inbound stats work', () => {
  const f = fixture();
  expect(f.sample(0, 0, false, { otherInbound: true })).toBe(false);
  expect(f.sample(20_000, 0, false, { otherInbound: true })).toBe(true);
});
it('does not recover missing stats on an unmuted track', () => {
  const f = fixture();
  f.track.muted = false;
  f.sample(0, 0, false, { otherInbound: true });
  expect(f.sample(30_000, 0, false, { otherInbound: true })).toBe(false);
});
it('recovers video that receives bytes but never decodes its first frame', () => {
  const f = fixture();
  f.track.muted = false;
  expect(f.sample(0, 100, true, { frames: 0 })).toBe(false);
  expect(f.sample(20_000, 2000, true, { frames: 0 })).toBe(true);
  expect(receiverPacketState(f.track as unknown as MediaStreamTrack)).toBe(
    false
  );
});
it('does not rebuild a decoded static video or unsupported frame counters', () => {
  for (const frames of [1, undefined]) {
    const f = fixture();
    f.track.muted = false;
    f.sample(0, 100, true, { frames });
    expect(f.sample(30_000, 1000, true, { frames })).toBe(false);
  }
});
it('clears the first-frame deadline when the camera is disabled or replaced', () => {
  const f = fixture();
  f.track.muted = false;
  f.sample(0, 100, true, { frames: 0 });
  f.participants.peer!.media.videoEnabled = false;
  f.sample(10_000, 200, true, { frames: 0 });
  f.participants.peer!.media.videoEnabled = true;
  expect(f.sample(30_000, 300, true, { frames: 0 })).toBe(false);
  f.owners.get('0')!.subscriptionKey = 'replacement:video';
  expect(f.sample(50_000, 400, true, { frames: 0 })).toBe(false);
});

it('ignores invalid sibling counters when video has no inbound report', () => {
  for (const siblingBytes of [Infinity, NaN, -1, 0]) {
    const f = fixture();
    const options = { otherInbound: true, siblingBytes };
    f.sample(0, 0, false, options);
    expect(f.sample(30_000, 0, false, options)).toBe(false);
  }
});

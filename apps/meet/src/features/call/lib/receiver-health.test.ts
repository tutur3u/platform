import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { describe, expect, it } from 'vitest';
import { createReceiverHealthCheck } from './receiver-health';
import type { RemoteTrackOwner } from './remote-playback';

function fixture() {
  const track = { id: 'video', muted: true };
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
  const sample = (time: number, bytes = 0, report = true) =>
    check(
      pc,
      new Map(
        report
          ? [['in', { type: 'inbound-rtp', mid: '0', bytesReceived: bytes }]]
          : []
      ) as unknown as RTCStatsReport,
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

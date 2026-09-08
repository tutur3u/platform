import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { setReceiverPacketState } from './receiver-packet-state';
import type { RemoteTrackOwner } from './remote-playback';

/** A live receiver is not proof of incoming RTP. Give a new publication time to start. */
export function createReceiverHealthCheck() {
  const observations = new Map<
    string,
    { bytes: number; since: number; baseline: number }
  >();
  const resumedTracks = new WeakSet<MediaStreamTrack>();
  const missingVideoSince = new Map<string, number>();
  const undecodedSince = new Map<string, number>();
  return (
    pc: RTCPeerConnection,
    stats: RTCStatsReport,
    owners: Map<string, RemoteTrackOwner>,
    participants: Record<string, MeetRealtimePresence>,
    now: number
  ) => {
    const active = new Set<string>();
    let stalled = false;
    for (const transceiver of pc.getTransceivers()) {
      const mid = transceiver.mid;
      if (mid === null) continue;
      const owner = owners.get(mid);
      if (!owner) continue;
      const track = transceiver.receiver.track;
      if (track.readyState !== 'live') {
        setReceiverPacketState(track, false);
        continue;
      }
      const media = participants[owner.userId]?.media;
      const expected =
        media &&
        (owner.kind === 'audio'
          ? media.audioEnabled
          : owner.kind === 'video'
            ? media.videoEnabled
            : media.screenEnabled);
      if (!expected) {
        resumedTracks.add(track);
        setReceiverPacketState(track, false);
        continue;
      }
      const key = `${mid}:${owner.subscriptionKey}`;
      active.add(key);
      const inbound = [...stats.values()].filter(
        (stat) =>
          stat.type === 'inbound-rtp' &&
          (stat.mid === mid || stat.trackIdentifier === track.id)
      );
      const video = owner.kind === 'video' || owner.kind === 'screen';
      // Inbound stats may not exist until the first packet. A working sibling
      // stream plus a persistently muted video track distinguishes this from
      // a browser that supplies no inbound statistics at all.
      const missingVideo =
        video &&
        track.muted &&
        !inbound.length &&
        [...stats.values()].some(
          (stat) =>
            stat.type === 'inbound-rtp' &&
            typeof stat.bytesReceived === 'number' &&
            Number.isFinite(stat.bytesReceived) &&
            stat.bytesReceived > 0
        );
      if (missingVideo) {
        const since = missingVideoSince.get(key) ?? now;
        missingVideoSince.set(key, since);
        setReceiverPacketState(track, false);
        if (now - since >= 20_000) stalled = true;
      } else missingVideoSince.delete(key);
      // Unsupported stats alone cannot establish a failed stream.
      if (
        !inbound.length ||
        inbound.some(
          (stat) =>
            typeof stat.bytesReceived !== 'number' ||
            !Number.isFinite(stat.bytesReceived) ||
            stat.bytesReceived < 0
        )
      ) {
        observations.delete(key);
        undecodedSince.delete(key);
        if (!missingVideo) setReceiverPacketState(track, undefined);
        continue;
      }
      const bytes = inbound.reduce((sum, stat) => sum + stat.bytesReceived, 0);
      const previous = observations.get(key);
      const baseline =
        previous?.baseline ?? (resumedTracks.has(track) ? bytes : 0);
      resumedTracks.delete(track);
      const noDecodedFrames =
        video && bytes > 0 && inbound.every((stat) => stat.framesDecoded === 0);
      if (noDecodedFrames) {
        const since = undecodedSince.get(key) ?? now;
        undecodedSince.set(key, since);
        if (now - since >= 20_000) stalled = true;
      } else undecodedSince.delete(key);
      setReceiverPacketState(
        track,
        bytes > baseline && !track.muted && !noDecodedFrames
      );
      if (!previous || previous.bytes !== bytes)
        observations.set(key, { bytes, since: now, baseline });
      else if (now - previous.since >= 20_000 && (bytes === 0 || track.muted))
        stalled = true;
      // The resume baseline controls the badge only. Prior packets on an unmuted
      // receiver may be followed by legitimate silence/DTX or static screen content.
    }
    for (const map of [observations, missingVideoSince, undecodedSince])
      for (const key of map.keys()) if (!active.has(key)) map.delete(key);
    return stalled;
  };
}

/** Rebuild only the receive side; preserve the microphone, camera, and call membership. */
export function watchReceiverHealth(
  pc: RTCPeerConnection,
  owners: Map<string, RemoteTrackOwner>,
  participants: () => Record<string, MeetRealtimePresence>,
  isCurrent: () => boolean,
  recover: () => void
) {
  const check = createReceiverHealthCheck();
  let busy = false;
  const stop = () => {
    clearInterval(timer);
    pc.removeEventListener('connectionstatechange', changed);
  };
  const changed = () => {
    if (pc.connectionState === 'closed' || !isCurrent()) stop();
  };
  const timer = setInterval(async () => {
    if (!isCurrent() || pc.connectionState === 'closed') {
      stop();
      return;
    }
    if (busy || pc.connectionState !== 'connected') return;
    busy = true;
    try {
      const stats = await pc.getStats();
      if (isCurrent() && check(pc, stats, owners, participants(), Date.now()))
        recover();
    } catch {
      /* Missing statistics must not disrupt a call. */
    } finally {
      busy = false;
    }
  }, 3000);
  pc.addEventListener('connectionstatechange', changed);
  return stop;
}

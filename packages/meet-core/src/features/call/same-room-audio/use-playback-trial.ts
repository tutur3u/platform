'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { MeetRoomController } from '../lib/room-controller';
import {
  selectionChecksum,
  trialCodePattern,
  type TrialEvent,
  trialFlag,
  trialPlayback,
} from './playback-trial';

function readOptIn() {
  try {
    return window.localStorage.getItem(trialFlag) === '1';
  } catch {
    return false;
  }
}

function subscribeOptIn(onChange: () => void) {
  let timer: number | undefined;
  const refresh = () => {
    // Same-tab DevTools edits do not emit a storage event.
    if (readOptIn()) {
      timer ??= window.setInterval(refresh, 1000);
    } else {
      window.clearInterval(timer);
      timer = undefined;
    }
    onChange();
  };
  window.addEventListener('focus', refresh);
  window.addEventListener('storage', refresh);
  refresh();
  return () => {
    window.removeEventListener('focus', refresh);
    window.removeEventListener('storage', refresh);
    window.clearInterval(timer);
  };
}

const readServerOptIn = () => false;
type Snapshot = {
  speaker: string | null;
  members: readonly string[];
  muted: ReadonlyMap<string, string>;
};

export function usePlaybackTrial(
  room: MeetRoomController,
  callId: string,
  inCall: boolean
) {
  const optIn = useSyncExternalStore(
    subscribeOptIn,
    readOptIn,
    readServerOptIn
  );
  const eligible =
    optIn &&
    inCall &&
    room.state.admission === 'admitted' &&
    room.state.settings.transport !== 'presence';
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<TrialEvent[]>([]);
  const previous = useRef<Snapshot | null>(null);
  const listenerId = room.state.selfUserId ?? '';
  const roster = room.state.participants;
  const { connectionStatus, remoteMedia } = room;
  const ids = useMemo(() => Object.keys(selected), [selected]);
  const snapshot = useMemo<Snapshot>(() => {
    const playback = trialPlayback({
      callId,
      code: eligible ? code : '',
      selected: ids,
      present: new Set(Object.keys(roster)),
      listenerId,
      connected: connectionStatus === 'open',
    });
    const muted = new Map<string, string>();
    if (eligible && code) {
      for (const [publisherId, tracks] of Object.entries(remoteMedia)) {
        const track = tracks.audio;
        if (
          track &&
          playback.suppresses({
            kind: 'microphone',
            publisherId,
          })
        ) {
          muted.set(publisherId, track.id);
        }
      }
    }
    const { members, speaker } = playback;
    return { members, speaker, muted };
  }, [
    callId,
    code,
    connectionStatus,
    eligible,
    ids,
    listenerId,
    remoteMedia,
    roster,
  ]);

  const active = eligible && !!code && ids.includes(listenerId);
  useEffect(() => {
    if (eligible) return;
    setCode('');
    setSelected({});
  }, [eligible]);

  useEffect(() => {
    const before = previous.current;
    previous.current = snapshot;
    const atMs = Date.now();
    const next: TrialEvent[] = [];
    for (const participantId of snapshot.members) {
      if (!before?.members.includes(participantId)) {
        next.push({ atMs, kind: 'join', participantId });
      }
    }
    for (const participantId of before?.members ?? []) {
      if (!snapshot.members.includes(participantId)) {
        next.push({ atMs, kind: 'leave', participantId });
      }
    }
    const { speaker } = snapshot;
    if (speaker && speaker !== before?.speaker) {
      const kind =
        before?.speaker &&
        ids.includes(before.speaker) &&
        !snapshot.members.includes(before.speaker)
          ? 'failover'
          : 'designation';
      next.push({ atMs, kind, participantId: speaker });
    }
    for (const [participantId, trackId] of before?.muted ?? []) {
      if (snapshot.muted.get(participantId) !== trackId) {
        next.push({ atMs, kind: 'mic-restored', participantId, trackId });
      }
    }
    for (const [participantId, trackId] of snapshot.muted) {
      if (before?.muted.get(participantId) !== trackId) {
        next.push({ atMs, kind: 'mic-muted', participantId, trackId });
      }
    }
    if (next.length) setEvents((current) => [...current, ...next].slice(-2000));
  }, [ids, snapshot]);

  const options = Object.entries({
    ...selected,
    ...Object.fromEntries(
      Object.values(roster).map(({ userId, displayName }) => [
        userId,
        displayName,
      ])
    ),
  }).sort(([a], [b]) => (a < b ? -1 : Number(a !== b)));
  return {
    active,
    checksum: selectionChecksum(ids),
    eligible,
    events,
    listenerId,
    muted: snapshot.muted,
    options,
    roster,
    selected,
    speaker: snapshot.speaker,
    join: (value: string) => {
      const normalized = value.trim().toUpperCase();
      if (
        !eligible ||
        !trialCodePattern.test(normalized) ||
        ids.length < 2 ||
        !ids.includes(listenerId)
      ) {
        return false;
      }
      setCode(normalized);
      return true;
    },
    leave: () => setCode(''),
    markSync: () =>
      setEvents((current) =>
        [...current, { atMs: Date.now(), kind: 'sync' as const }].slice(-2000)
      ),
    select: (id: string, name: string, checked: boolean) =>
      setSelected((current) => {
        const next = { ...current };
        if (checked) next[id] = name;
        else delete next[id];
        return next;
      }),
  };
}

export type PlaybackTrial = ReturnType<typeof usePlaybackTrial>;

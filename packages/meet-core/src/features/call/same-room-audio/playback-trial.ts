import {
  createRoomAudioGroup,
  type PlaybackTrack,
  shouldPlayRoomAudio,
  stepRoomAudioGroup,
} from './group';

export const trialFlag = 'meet:same-room-trial';
export const trialCodePattern = /^[A-Z0-9]{6,10}$/;

export function selectionChecksum(ids: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const character of [...new Set(ids)].sort().join(',')) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function trialPlayback({
  callId,
  code,
  selected,
  present,
  listenerId,
  connected,
}: {
  callId: string;
  code: string;
  selected: readonly string[];
  present: ReadonlySet<string>;
  listenerId: string;
  connected: boolean;
}) {
  const active = trialCodePattern.test(code) && selected.includes(listenerId);
  const members = active
    ? [...new Set(selected)].filter((id) => present.has(id)).sort()
    : [];
  let group = active
    ? createRoomAudioGroup({
        callId,
        code,
        expiresAtMs: Number.MAX_SAFE_INTEGER,
        speakerMode: 'designated',
      })
    : null;
  for (const id of members) {
    if (!group) break;
    group = stepRoomAudioGroup(group, {
      kind: 'join',
      callId,
      code,
      nowMs: 0,
      member: {
        id,
        // The trial models playback only. Sender state is independent.
        mic: 'enabled',
        speaker: 'enabled',
        devices: { microphone: true, speaker: true },
      },
    });
  }
  return {
    members,
    speaker: members[0] ?? null,
    suppresses(track: Pick<PlaybackTrack, 'kind' | 'publisherId'>): boolean {
      if (
        !group ||
        track.kind === 'screen' ||
        track.publisherId === listenerId
      ) {
        return false;
      }
      return (
        !connected ||
        !shouldPlayRoomAudio(group, listenerId, { ...track, muted: false })
      );
    },
  };
}

export type TrialEventKind =
  | 'join'
  | 'leave'
  | 'designation'
  | 'failover'
  | 'mic-muted'
  | 'mic-restored'
  | 'sync';

export type TrialEvent = {
  atMs: number;
  kind: TrialEventKind;
  participantId?: string;
  trackId?: string;
};

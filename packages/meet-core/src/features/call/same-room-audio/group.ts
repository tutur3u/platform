export type SpeakerMode = 'all' | 'designated';
type Preference = 'enabled' | 'muted';
type Device = 'microphone' | 'speaker';

export type RoomMember = Readonly<{
  id: string;
  mic: Preference;
  speaker: Preference;
  devices: Readonly<Record<Device, boolean>>;
}>;

type GroupConfig = Readonly<{
  callId: string;
  code: string;
  expiresAtMs: number;
  speakerMode: SpeakerMode;
}>;

type ActiveGroup = GroupConfig & {
  readonly kind: 'active';
  readonly members: readonly RoomMember[];
};

export type RoomAudioGroup = ActiveGroup | Readonly<{ kind: 'expired' }>;

export type RoomAudioEvent = { nowMs: number } & (
  | {
      kind: 'join';
      callId: string;
      code: string;
      member: RoomMember;
    }
  | { kind: 'leave'; id: string }
  | { kind: 'expire' }
  | { kind: 'speaker-mode'; mode: SpeakerMode }
  | { kind: 'mic'; id: string; preference: Preference }
  | { kind: 'speaker'; id: string; preference: Preference }
  | { kind: 'device-disconnected'; id: string; device: Device | 'call' }
  | { kind: 'device-connected'; id: string; device: Device }
);

export function createRoomAudioGroup(config: GroupConfig): RoomAudioGroup {
  if (
    !/^[A-Z0-9]{6,10}$/.test(config.code) ||
    !config.callId ||
    !Number.isFinite(config.expiresAtMs)
  ) {
    throw new RangeError(
      'A call, short group code, and finite expiry are required'
    );
  }
  return { ...config, kind: 'active', members: [] };
}

export function stepRoomAudioGroup(
  group: RoomAudioGroup,
  event: RoomAudioEvent
): RoomAudioGroup {
  if (group.kind === 'expired') return group;
  if (event.nowMs >= group.expiresAtMs) return { kind: 'expired' };

  switch (event.kind) {
    case 'expire':
      return group;
    case 'join': {
      const { member } = event;
      if (
        event.callId !== group.callId ||
        event.code !== group.code ||
        !member.id ||
        group.members.some(({ id }) => id === member.id)
      ) {
        return group;
      }
      return {
        ...group,
        members: [
          ...group.members,
          { ...member, devices: { ...member.devices } },
        ],
      };
    }
    case 'speaker-mode':
      return { ...group, speakerMode: event.mode };
    case 'leave':
      return removeMember(group, event.id);
    case 'device-disconnected':
      return event.device === 'call'
        ? removeMember(group, event.id)
        : setDeviceAvailability(group, event.id, event.device, false);
    case 'device-connected':
      return setDeviceAvailability(group, event.id, event.device, true);
    case 'mic':
    case 'speaker':
      return updateMember(group, event.id, (member) => ({
        ...member,
        [event.kind]: event.preference,
      }));
  }
}

function removeMember(group: ActiveGroup, id: string): ActiveGroup {
  return {
    ...group,
    members: group.members.filter((member) => member.id !== id),
  };
}

function setDeviceAvailability(
  group: ActiveGroup,
  id: string,
  device: Device,
  available: boolean
): ActiveGroup {
  return updateMember(group, id, (member) => ({
    ...member,
    devices: { ...member.devices, [device]: available },
  }));
}

function updateMember(
  group: ActiveGroup,
  id: string,
  update: (member: RoomMember) => RoomMember
): ActiveGroup {
  return {
    ...group,
    members: group.members.map((member) =>
      member.id === id ? update(member) : member
    ),
  };
}

export function microphoneMembers(
  group: RoomAudioGroup
): readonly RoomMember[] {
  return group.kind === 'active'
    ? group.members.filter(
        ({ mic, devices }) => mic === 'enabled' && devices.microphone
      )
    : [];
}

export type PlaybackTrack = Readonly<{
  kind: 'microphone' | 'screen';
  publisherId: string;
  muted: boolean;
}>;

export function shouldPlayRoomAudio(
  group: RoomAudioGroup,
  listenerId: string,
  track: PlaybackTrack
): boolean {
  if (track.muted) return false;
  if (track.kind === 'screen') return true;
  if (listenerId === track.publisherId) return false;
  if (group.kind === 'expired') return true;

  const publisher = group.members.find(({ id }) => id === track.publisherId);
  if (
    publisher &&
    (publisher.mic === 'muted' || !publisher.devices.microphone)
  ) {
    return false;
  }
  const listener = group.members.find(({ id }) => id === listenerId);
  if (!listener) return true;
  if (publisher || !canPlayRemoteMics(listener)) return false;
  return (
    group.speakerMode === 'all' ||
    group.members.find(canPlayRemoteMics)?.id === listener.id
  );
}

function canPlayRemoteMics(member: RoomMember): boolean {
  return member.speaker === 'enabled' && member.devices.speaker;
}

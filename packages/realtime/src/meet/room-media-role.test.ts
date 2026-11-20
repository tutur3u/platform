import { expect, it } from 'vitest';
import type { MeetRealtimeClientMessage } from './messages';
import { getMeetRealtimeScopesForRole } from './permissions';
import {
  type MeetRealtimeRole,
  type MeetRealtimeTokenPayload,
  meetRealtimeTokenPayloadSchema,
} from './primitives';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  type MeetRoomSnapshot,
  releaseParticipant,
} from './room';
import { recoverMeetMediaRoles } from './room-media-role';

const now = '2026-11-20T12:00:00.000Z';
const host = participant('host', 1, { maxParticipants: 50, maxPublishers: 50 });

function participant(
  role: MeetRealtimeRole,
  index: number,
  limits = {},
  accountId?: string
) {
  return meetRealtimeTokenPayloadSchema.parse({
    accountId,
    admission: role === 'host' ? 'open' : 'lobby',
    exp: 2_000_000_000,
    limits,
    meetingApp: 'meet',
    meetingId: '11111111-1111-4111-8111-111111111111',
    roomId: 'test:class-viewers',
    role,
    scopes: getMeetRealtimeScopesForRole(role),
    userId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    wsId: '22222222-2222-4222-8222-222222222222',
  });
}

function command(
  state: MeetRoomSnapshot,
  message: MeetRealtimeClientMessage,
  token = host
) {
  return applyMeetRoomCommand(state, {
    message,
    now,
    requireAdmission: true,
    token,
  });
}

function classroom() {
  const initial = admitOrHold(createMeetRoomSnapshot(), host, now).state;
  return command(initial, {
    type: 'room.settings.update',
    settings: { viewersByDefault: true },
  }).state;
}

const admitAll = { type: 'admission.decideAll', admit: true } as const;
const publish = {
  type: 'sfu.tracks.publish',
  sessionDescription: { type: 'offer', sdp: 'test-offer' },
  sessionId: 'pub',
  tracks: [{ location: 'local', trackName: 'camera', mid: '0', kind: 'video' }],
} satisfies MeetRealtimeClientMessage;

it.each(['single', 'bulk'])(
  'keeps a signed viewer in viewer capacity on %s approval',
  (approval) => {
    const legacyHost = participant('host', 1);
    let state = admitOrHold(createMeetRoomSnapshot(), legacyHost, now).state;
    for (let index = 2; index <= 8; index++) {
      const speaker = participant('speaker', index);
      state = admitOrHold(state, { ...speaker, admission: 'open' }, now).state;
    }
    const viewer = participant('viewer', 9);
    state = admitOrHold(state, viewer, now).state;
    const pending = state.waiting[viewer.userId];
    if (!pending) throw new Error('Expected waiting viewer');
    state = {
      ...state,
      waiting: {
        ...state.waiting,
        [viewer.userId]: { ...pending, role: undefined },
      },
    };
    const decision: MeetRealtimeClientMessage =
      approval === 'bulk'
        ? admitAll
        : { type: 'admission.decide', userId: viewer.userId, admit: true };
    const unknown = command(state, decision, legacyHost).state;
    expect(unknown.presence[viewer.userId]).toBeUndefined();
    const restored = recoverMeetMediaRoles(state, [viewer]);
    const admitted = command(restored, decision, legacyHost).state;
    expect(admitted.waiting[viewer.userId]).toBeUndefined();
    expect(admitted.presence[viewer.userId]?.role).toBe('viewer');
    expect(command(admitted, publish, viewer).reply).toContainEqual(
      expect.objectContaining({ error: 'publish_not_allowed' })
    );
    expect(
      command(admitted, publish, participant('speaker', 9)).sfu
    ).toBeNull();
  }
);

it.each(['speaker-first', 'viewer-first'])(
  'admits viewers with full speaker capacity in the %s queue',
  (order) => {
    const legacyHost = participant('host', 1);
    let state = admitOrHold(createMeetRoomSnapshot(), legacyHost, now).state;
    for (let index = 2; index <= 8; index++) {
      const speaker = participant('speaker', index);
      state = admitOrHold(state, { ...speaker, admission: 'open' }, now).state;
    }
    const speaker = participant('speaker', 9);
    const viewer = participant('viewer', 10);
    const queue =
      order === 'speaker-first' ? [speaker, viewer] : [viewer, speaker];
    for (const arrival of queue) state = admitOrHold(state, arrival, now).state;
    const result = command(state, admitAll, legacyHost).state;
    expect(result.presence[viewer.userId]?.role).toBe('viewer');
    expect(result.waiting[speaker.userId]?.role).toBe('speaker');
  }
);

it('keeps an admitted speaker on the same and a new device after opting in', () => {
  const initial = admitOrHold(createMeetRoomSnapshot(), host, now).state;
  const accountId = participant('speaker', 10).userId;
  const speaker = participant('speaker', 2, {}, accountId);
  const admitted = command(
    admitOrHold(initial, speaker, now).state,
    admitAll
  ).state;
  const optedIn = command(admitted, {
    type: 'room.settings.update',
    settings: { viewersByDefault: true },
  }).state;
  const left = releaseParticipant(
    optedIn,
    speaker.userId,
    speaker.roomId,
    now
  ).state;
  const otherDevice = participant('speaker', 3, {}, accountId);
  for (const device of [speaker, otherDevice]) {
    const rejoined = admitOrHold(left, device, now).state;
    expect(rejoined.presence[device.userId]?.role).toBe('speaker');
    expect(command(rejoined, publish, device).sfu?.message.type).toBe(
      'sfu.tracks.publish'
    );
  }
  const signedViewer = participant('viewer', 4, {}, accountId);
  const watched = admitOrHold(left, signedViewer, now).state;
  expect(watched.presence[signedViewer.userId]?.role).toBe('viewer');
  expect(command(watched, publish, signedViewer).sfu).toBeNull();
});

it('does not downgrade a speaker when the host admits a second device as a viewer', () => {
  const accountId = participant('speaker', 10).userId;
  const speaker = participant('speaker', 2, {}, accountId);
  const viewer = participant('speaker', 3, {}, accountId);
  const initial = admitOrHold(createMeetRoomSnapshot(), host, now).state;
  const speakerWaiting = admitOrHold(initial, speaker, now).state;
  const optedIn = command(speakerWaiting, {
    type: 'room.settings.update',
    settings: { viewersByDefault: true },
  }).state;
  const bothWaiting = admitOrHold(optedIn, viewer, now).state;
  const admitted = command(bothWaiting, admitAll).state;
  expect(admitted.presence[speaker.userId]?.role).toBe('speaker');
  expect(admitted.presence[viewer.userId]?.role).toBe('viewer');
  expect(command(admitted, publish, speaker).sfu).toBeTruthy();
  expect(command(admitted, publish, viewer).sfu).toBeNull();
  const left = releaseParticipant(
    admitted,
    speaker.userId,
    speaker.roomId,
    now
  ).state;
  const returned = admitOrHold(left, speaker, now).state;
  expect(returned.presence[speaker.userId]?.role).toBe('speaker');
  expect(command(returned, publish, speaker).sfu).toBeTruthy();
});

it.each([
  { mode: 'webinar' },
  { mode: 'stream' },
  { mode: 'call', meetingApp: 'parley' },
] satisfies Array<Partial<MeetRealtimeTokenPayload>>)(
  'isolates Meet call roles from a viewer with claims %o',
  (source) => {
    const accountId = participant('speaker', 10).userId;
    const ordinaryCall = participant('speaker', 2, {}, accountId);
    const otherViewer = { ...ordinaryCall, ...source, role: 'viewer' } as const;
    const initial = admitOrHold(createMeetRoomSnapshot(), host, now).state;
    const inOtherMode = admitOrHold(
      initial,
      { ...otherViewer, admission: 'open' },
      now
    ).state;
    expect(inOtherMode.approved?.[accountId]?.classMediaRole).toBeUndefined();
    const prior = inOtherMode.presence[ordinaryCall.userId];
    if (!prior) throw new Error('Expected viewer in other mode');
    const legacy = {
      ...inOtherMode,
      presence: {
        ...inOtherMode.presence,
        [ordinaryCall.userId]: { ...prior, nonClassMedia: undefined },
      },
    };
    const restored = recoverMeetMediaRoles(legacy, [otherViewer]);
    expect(restored.presence[ordinaryCall.userId]?.nonClassMedia).toBe(true);
    const conflicted = admitOrHold(restored, ordinaryCall, now);
    expect(conflicted.reply).toContainEqual(
      expect.objectContaining({ error: 'room_mode_conflict' })
    );
    const left = releaseParticipant(
      restored,
      ordinaryCall.userId,
      ordinaryCall.roomId,
      now
    ).state;
    const inCall = admitOrHold(left, ordinaryCall, now).state;
    expect(inCall.presence[ordinaryCall.userId]?.role).toBe('speaker');
    const optedIn = classroom();
    const callViewer = command(
      admitOrHold(optedIn, ordinaryCall, now).state,
      admitAll
    ).state;
    const elsewhere = admitOrHold(
      callViewer,
      { ...ordinaryCall, ...source, admission: 'open' },
      now
    );
    expect(elsewhere.reply).toContainEqual(
      expect.objectContaining({ error: 'room_mode_conflict' })
    );
    expect(elsewhere.state.presence[ordinaryCall.userId]?.role).toBe('viewer');
    expect(
      command(elsewhere.state, publish, { ...ordinaryCall, ...source }).sfu
    ).toBeNull();
    expect(command(elsewhere.state, publish, ordinaryCall).sfu).toBeNull();
  }
);

it('recovers a signed viewer recorded in a legacy speaker row and retires its stale publication', () => {
  const speaker = participant('speaker', 2);
  const viewer = participant('viewer', 2);
  const initial = admitOrHold(createMeetRoomSnapshot(), host, now).state;
  const admitted = command(
    admitOrHold(initial, speaker, now).state,
    admitAll
  ).state;
  const published = command(admitted, publish, speaker).state;
  const person = published.presence[speaker.userId];
  if (!person) throw new Error('Expected legacy presence');
  const legacy: MeetRoomSnapshot = {
    ...published,
    approved: {},
    presence: {
      ...published.presence,
      [speaker.userId]: { ...person, nonClassMedia: undefined },
    },
  };
  const recovered = recoverMeetMediaRoles(legacy, [speaker, viewer]);
  expect(recovered.presence[speaker.userId]?.role).toBe('viewer');
  expect(recovered.approved?.[speaker.userId]?.classMediaRole).toBe('viewer');
  expect(Object.keys(recovered.tracks)).toHaveLength(0);
  expect(recovered.budget?.pendingPublications).toHaveLength(1);
  expect(recovered.presenceSeq).toBe((legacy.presenceSeq ?? 0) + 1);
  expect(command(recovered, publish, speaker).sfu).toBeNull();
});

it('leaves an old untagged Parley connection rejoinable with its tagged token', () => {
  const old = {
    ...participant('speaker', 31),
    meetingApp: undefined,
    admission: 'open',
  } as const;
  const legacy = admitOrHold(createMeetRoomSnapshot(), old, now).state;
  const restored = recoverMeetMediaRoles(legacy, [old]);
  expect(restored.presence[old.userId]?.nonClassMedia).toBeUndefined();
  const rejoined = admitOrHold(restored, { ...old, meetingApp: 'parley' }, now);
  expect(rejoined.reply).toContainEqual(
    expect.objectContaining({ type: 'ready' })
  );
  expect(rejoined.state.presence[old.userId]?.nonClassMedia).toBe(true);
});

it('admits a 40-person lobby as viewers when the host enables viewer mode', () => {
  let state = classroom();
  for (let index = 2; index <= 41; index++) {
    const arrival = admitOrHold(state, participant('speaker', index), now);
    expect(arrival.reply).toContainEqual(
      expect.objectContaining({
        type: 'ready',
        admission: 'waiting',
        role: 'viewer',
      })
    );
    state = arrival.state;
  }
  const admitted = command(state, admitAll).state;
  expect(Object.keys(admitted.waiting)).toHaveLength(0);
  const presence = Object.values(admitted.presence);
  expect(presence.filter((person) => person.role === 'viewer')).toHaveLength(
    40
  );
  expect(presence.filter((person) => person.role !== 'viewer')).toHaveLength(1);
});

it('keeps an auto-admitted viewer on both refreshed and new device tokens', () => {
  const viewer = participant('speaker', 2);
  const auto = command(classroom(), {
    type: 'room.settings.update',
    settings: { skipLobby: true },
  }).state;
  const admitted = admitOrHold(auto, viewer, now).state;
  const settled = command(admitted, {
    type: 'room.settings.update',
    settings: { viewersByDefault: false },
  }).state;
  expect(
    admitOrHold(settled, viewer, now).state.presence[viewer.userId]?.role
  ).toBe('viewer');
  const left = releaseParticipant(
    settled,
    viewer.userId,
    viewer.roomId,
    now
  ).state;
  const newDevice = participant('speaker', 3, {}, viewer.userId);
  const rejoined = admitOrHold(left, newDevice, now).state;
  expect(rejoined.presence[newDevice.userId]?.role).toBe('viewer');
  expect(command(rejoined, publish, newDevice).sfu).toBeNull();
});

it('requires the host to promote and still enforces room media locks', () => {
  const viewer = participant('viewer', 2);
  const admitted = command(
    admitOrHold(classroom(), viewer, now).state,
    admitAll
  ).state;
  const promote = {
    type: 'participant.promote',
    userId: viewer.userId,
  } as const;
  expect(command(admitted, promote, viewer).reply).toContainEqual(
    expect.objectContaining({ error: 'permission_denied' })
  );
  expect(command(admitted, publish, viewer).sfu).toBeNull();
  const promoted = command(admitted, promote).state;
  expect(promoted.presence[viewer.userId]?.role).toBe('speaker');
  expect(command(promoted, publish, viewer).sfu?.message.type).toBe(
    'sfu.tracks.publish'
  );
  const left = releaseParticipant(
    promoted,
    viewer.userId,
    viewer.roomId,
    now
  ).state;
  const newDevice = participant('viewer', 3, {}, viewer.userId);
  const rejoined = admitOrHold(left, newDevice, now).state;
  expect(rejoined.presence[newDevice.userId]?.role).toBe('speaker');
  const locked = command(rejoined, {
    type: 'room.settings.update',
    settings: { camerasLocked: true },
  }).state;
  expect(command(locked, publish, newDevice).sfu).toBeNull();
});

it('rejects promotion when every publisher slot is occupied', () => {
  const viewer = participant('viewer', 2);
  const admitted = command(
    admitOrHold(classroom(), viewer, now).state,
    admitAll
  ).state;
  const budget = admitted.budget;
  if (!budget) throw new Error('Expected room budget');
  const full = { ...admitted, budget: { ...budget, maxPublishers: 1 } };
  const result = command(full, {
    type: 'participant.promote',
    userId: viewer.userId,
  });
  expect(result.reply).toContainEqual(
    expect.objectContaining({ error: 'publisher_limit_reached' })
  );
  expect(result.state.presence[viewer.userId]?.role).toBe('viewer');
});

it('rejects viewer mode from a host without the signed classroom capacity', () => {
  const ordinaryHost = participant('host', 1);
  const initial = admitOrHold(
    createMeetRoomSnapshot(),
    ordinaryHost,
    now
  ).state;
  const result = command(
    initial,
    { type: 'room.settings.update', settings: { viewersByDefault: true } },
    ordinaryHost
  );
  expect(result.reply).toContainEqual(
    expect.objectContaining({ error: 'permission_denied' })
  );
  expect(result.state.settings?.viewersByDefault).toBeUndefined();
});

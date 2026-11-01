import { describe, expect, it } from 'vitest';
import {
  type MeetRealtimeClientMessage,
  meetRealtimeClientMessageSchema,
} from './messages';
import { getMeetRealtimeScopesForRole } from './permissions';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  releaseParticipant,
} from './room';
import { canReadRoomNotes } from './room-controls';

const hostId = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const guestId = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
const now = '2026-09-07T14:00:00.000Z';
const token = (role: 'host' | 'speaker') =>
  meetRealtimeTokenPayloadSchema.parse({
    role,
    admission: role === 'host' ? 'open' : 'lobby',
    userId: role === 'host' ? hostId : guestId,
    displayName: role,
    avatarUrl: 'https://example.com/avatar.png',
    roomId: 'test',
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    exp: 2_000_000_000,
    limits: {},
    scopes: getMeetRealtimeScopesForRole(role),
  });
const host = token('host'),
  guest = token('speaker');
const run = (
  state: ReturnType<typeof createMeetRoomSnapshot>,
  message: MeetRealtimeClientMessage,
  as = host,
  time = now,
  notesEligible = true
) =>
  applyMeetRoomCommand(state, { message, token: as, now: time, notesEligible });
function admitted() {
  const hosting = admitOrHold(createMeetRoomSnapshot(), host, now).state;
  const waiting = admitOrHold(hosting, guest, now).state;
  return run(waiting, {
    type: 'admission.decide',
    userId: guestId,
    admit: true,
  }).state;
}

describe('persistent room controls', () => {
  it('remembers an admitted identity across leaving and permits host revocation', () => {
    const state = admitted();
    expect(state.approved?.[guestId]).toMatchObject({
      displayName: 'speaker (guest)',
      avatarUrl: guest.avatarUrl,
    });
    const left = releaseParticipant(
      { ...state, lastReactionAt: { [guestId]: 123, [hostId]: 456 } },
      guestId,
      'test'
    ).state;
    expect(left.lastReactionAt).toEqual({ [hostId]: 456 });
    expect(admitOrHold(left, guest, now).reply[0]).toMatchObject({
      admission: 'admitted',
    });
    const forgotten = run(left, {
      type: 'admission.forget',
      userId: guestId,
    }).state;
    expect(admitOrHold(forgotten, guest, now).reply[0]).toMatchObject({
      admission: 'waiting',
    });
  });
  it('revokes remembered approval when the host removes a participant', () => {
    const removed = run(admitted(), {
      type: 'participant.remove',
      userId: guestId,
    });
    expect(removed.state.approved?.[guestId]).toBeUndefined();
    expect(admitOrHold(removed.state, guest, now).reply[0]).toMatchObject({
      admission: 'waiting',
    });
  });
  it.each<MeetRealtimeClientMessage>([
    { type: 'room.end' },
    { type: 'room.settings.update', settings: { shareNotes: true } },
    { type: 'admission.forget', userId: hostId },
  ])('rejects guest control $type', (message) => {
    const result = run(admitted(), message, guest);
    expect(result.reply[0]).toMatchObject({ error: 'permission_denied' });
    expect(result.broadcast).toEqual([]);
  });
  it('ends the room for current and future participants', () => {
    const result = run(admitted(), { type: 'room.end' });
    expect(result.disconnect.sort()).toEqual([hostId, guestId].sort());
    expect(result.state.presence).toEqual({});
    expect(result.broadcast).toEqual([{ type: 'room.ended', by: hostId }]);
    expect(result.broadcast[0]).not.toHaveProperty('requestId');
    expect(result.state.lastReactionAt).toEqual({});
    expect(admitOrHold(result.state, guest, now).reply).toEqual([
      { type: 'room.ended' },
    ]);
    expect(run(result.state, { type: 'presence.join' }).reply).toEqual([
      { type: 'room.ended' },
    ]);
  });
  it('shares notes only with approved/current participants and fails closed after revocation', () => {
    const state = admitted();
    expect(canReadRoomNotes(state, host)).toBe(true);
    expect(canReadRoomNotes(state, guest)).toBe(false);
    const shared = run(state, {
      type: 'room.settings.update',
      settings: { shareNotes: true },
    }).state;
    expect(canReadRoomNotes(shared, guest)).toBe(true);
    expect(canReadRoomNotes(shared, { ...guest, userId: 'uninvited' })).toBe(
      false
    );
    const left = releaseParticipant(shared, guestId, 'test').state;
    expect(canReadRoomNotes(left, guest)).toBe(true);
    const revoked = run(left, {
      type: 'admission.forget',
      userId: guestId,
    }).state;
    expect(canReadRoomNotes(revoked, guest)).toBe(false);
    expect(
      canReadRoomNotes(
        run(shared, {
          type: 'room.settings.update',
          settings: { shareNotes: false },
        }).state,
        guest
      )
    ).toBe(false);
  });
  it('denies enabling note sharing outside the Meet AI workspace gate', () => {
    const state = admitted();
    for (const settings of [
      { shareNotes: true },
      { shareNotesAfterMeeting: true },
    ]) {
      const result = run(
        state,
        { type: 'room.settings.update', settings },
        host,
        now,
        false
      );
      expect(result.reply[0]).toMatchObject({ error: 'permission_denied' });
      expect(result.broadcast).toEqual([]);
      expect(result.state.settings).toEqual(state.settings);
    }
    const defaulted = applyMeetRoomCommand(state, {
      message: { type: 'room.settings.update', settings: { shareNotes: true } },
      token: host,
      now,
    });
    expect(defaulted.reply[0]).toMatchObject({ error: 'permission_denied' });
  });
  it('still lets the host turn note sharing off and change other settings without eligibility', () => {
    const shared = run(admitted(), {
      type: 'room.settings.update',
      settings: { shareNotes: true },
    }).state;
    const off = run(
      shared,
      { type: 'room.settings.update', settings: { shareNotes: false } },
      host,
      now,
      false
    );
    expect(off.state.settings?.shareNotes).toBe(false);
    const other = run(
      admitted(),
      { type: 'room.settings.update', settings: { saveChat: true } },
      host,
      now,
      false
    );
    expect(other.state.settings?.saveChat).toBe(true);
  });
  it('sends bounded reactions without accepting arbitrary markup', () => {
    expect(
      meetRealtimeClientMessageSchema.safeParse({
        type: 'reaction.send',
        reaction: '<script>',
      }).success
    ).toBe(false);
    const first = run(
      admitted(),
      { type: 'reaction.send', reaction: 'clap' },
      guest
    );
    expect(first.broadcast[0]).toMatchObject({
      type: 'reaction',
      reaction: 'clap',
      userId: guestId,
    });
    expect(
      run(first.state, { type: 'reaction.send', reaction: 'clap' }, guest)
        .broadcast
    ).toEqual([]);
    expect(
      run(
        first.state,
        { type: 'reaction.send', reaction: 'heart' },
        guest,
        '2026-09-07T14:00:02.000Z'
      ).broadcast
    ).toHaveLength(1);
  });
});

it('restricts live title announcements to the host', () => {
  const state = admitted();
  const denied = run(
    state,
    { type: 'room.title.update', title: 'Changed' },
    guest
  );
  expect(denied.reply).toContainEqual(
    expect.objectContaining({ type: 'error', error: 'permission_denied' })
  );
  expect(
    run(state, { type: 'room.title.update', title: 'Changed' }).broadcast
  ).toContainEqual({ type: 'room.title.changed', title: 'Changed' });
  expect(
    meetRealtimeClientMessageSchema.safeParse({
      type: 'room.title.update',
      title: ' ',
    }).success
  ).toBe(false);
});

it('requires separate opt-in for notes after ending a meeting', () => {
  const shared = run(admitted(), {
    type: 'room.settings.update',
    settings: { shareNotes: true },
  }).state;
  const outcome = run(shared, { type: 'room.end', requestId: 'end' });
  expect(outcome.reply).toContainEqual(
    expect.objectContaining({ type: 'room.ended', requestId: 'end' })
  );
  const ended = outcome.state;
  expect(canReadRoomNotes(ended, guest)).toBe(false);
  expect(canReadRoomNotes(ended, host)).toBe(true);
  expect(
    canReadRoomNotes(
      {
        ...ended,
        settings: { shareNotes: false, shareNotesAfterMeeting: true },
      },
      guest
    )
  ).toBe(true);
  expect(
    canReadRoomNotes(
      {
        ...ended,
        settings: { shareNotes: true, shareNotesAfterMeeting: false },
      },
      guest
    )
  ).toBe(false);
});

it('retains open-admission account access to shared post-meeting notes', () => {
  const visitor = { ...guest, admission: 'open' as const, accountId: guestId };
  const state = admitOrHold(
    admitOrHold(createMeetRoomSnapshot(), host, now).state,
    visitor,
    now
  ).state;
  state.settings = { shareNotes: false, shareNotesAfterMeeting: true };
  const ended = run(state, { type: 'room.end' }).state;
  expect(Object.keys(ended.presence)).toHaveLength(0);
  expect(canReadRoomNotes(ended, { ...visitor, userId: hostId })).toBe(true);
});
it('does not restore a connected participant’s forgotten approval when the room ends', () => {
  const visitor = { ...guest, admission: 'open' as const, accountId: guestId };
  let state = admitOrHold(
    admitOrHold(createMeetRoomSnapshot(), host, now).state,
    visitor,
    now
  ).state;
  state.settings = { shareNotes: false, shareNotesAfterMeeting: true };
  state = run(state, { type: 'admission.forget', userId: guestId }).state;
  const ended = run(state, { type: 'room.end' }).state;
  expect(canReadRoomNotes(ended, visitor)).toBe(false);
  expect(ended.approved?.[guestId]).toBeUndefined();
});

it('lets a waiting guest update their lobby display name before host admission', () => {
  const held = admitOrHold(
    admitOrHold(createMeetRoomSnapshot(), host, now).state,
    guest,
    now
  );
  const renamed = run(
    held.state,
    { type: 'presence.join', displayName: 'Alex Guest' },
    guest
  );
  expect(renamed.state.waiting[guestId]?.displayName).toBe(
    'Alex Guest (guest)'
  );
  expect(renamed.toManagers).toEqual([
    {
      type: 'admission.pending',
      participants: [
        expect.objectContaining({
          userId: guestId,
          displayName: 'Alex Guest (guest)',
        }),
      ],
    },
  ]);
  const approved = run(renamed.state, {
    type: 'admission.decide',
    userId: guestId,
    admit: true,
  });
  expect(approved.state.presence[guestId]?.displayName).toBe(
    'Alex Guest (guest)'
  );
});

it('binds lobby renaming to the authenticated sender, ignoring a supplied target', () => {
  const other = { ...guest, userId: 'other-guest' };
  const held = admitOrHold(
    admitOrHold(createMeetRoomSnapshot(), guest, now).state,
    other,
    now
  ).state;
  const message = meetRealtimeClientMessageSchema.parse({
    type: 'presence.join',
    userId: other.userId,
    displayName: 'Mine',
  });
  const renamed = run(held, message, guest).state;
  expect(renamed.waiting[guestId]?.displayName).toBe('Mine (guest)');
  expect(renamed.waiting[other.userId]?.displayName).toBe('speaker (guest)');
});

it('sanitizes lobby names and rejects empty or oversized input', () => {
  const held = admitOrHold(createMeetRoomSnapshot(), guest, now).state;
  const message = meetRealtimeClientMessageSchema.parse({
    type: 'presence.join',
    displayName: '  A\u0000\u202elex\u2069  ',
  });
  expect(run(held, message, guest).state.waiting[guestId]?.displayName).toBe(
    'Alex (guest)'
  );
  for (const displayName of ['x'.repeat(121), ' \u0000\u202e ']) {
    expect(
      meetRealtimeClientMessageSchema.safeParse({
        type: 'presence.join',
        displayName,
      }).success
    ).toBe(false);
  }
  for (const displayName of ['x'.repeat(120), '😀'.repeat(60)]) {
    expect(
      run(held, { type: 'presence.join', displayName }, guest).state.waiting[
        guestId
      ]?.displayName.length
    ).toBeLessThanOrEqual(120);
  }
});

it('freezes a lobby name after admission, including presence replay', () => {
  const held = admitOrHold(
    admitOrHold(createMeetRoomSnapshot(), host, now).state,
    guest,
    now
  ).state;
  const renamed = run(
    held,
    { type: 'presence.join', displayName: 'Alex' },
    guest
  ).state;
  const approved = run(renamed, {
    type: 'admission.decide',
    userId: guestId,
    admit: true,
  }).state;
  expect(
    run(approved, { type: 'presence.join', displayName: 'Changed' }, guest)
      .state.presence[guestId]?.displayName
  ).toBe('Alex (guest)');
  const left = releaseParticipant(approved, guestId, 'test').state;
  expect(
    run(
      admitOrHold(left, guest, now).state,
      { type: 'presence.join', displayName: 'Changed' },
      guest
    ).state.presence[guestId]?.displayName
  ).toBe('Alex (guest)');
});

it.each(['host', 'Member Name'])(
  'marks an impersonating guest as guest: %s',
  (displayName) => {
    const member = {
      ...guest,
      userId: 'member',
      accountId: 'member',
      displayName,
      admission: 'open' as const,
    };
    const held = admitOrHold(
      admitOrHold(
        admitOrHold(createMeetRoomSnapshot(), host, now).state,
        member,
        now
      ).state,
      guest,
      now
    ).state;
    const renamed = run(held, { type: 'presence.join', displayName }, guest);
    expect(renamed.state.waiting[guestId]?.displayName).toBe(
      `${displayName} (guest)`
    );
    expect(renamed.toManagers[0]).toMatchObject({
      participants: [
        expect.objectContaining({ displayName: `${displayName} (guest)` }),
      ],
    });
  }
);

it('marks first-party lobby tokens with an accountId as guests', () => {
  const visitor = {
    ...guest,
    accountId: guestId,
    displayName: host.displayName,
  };
  const held = admitOrHold(
    admitOrHold(createMeetRoomSnapshot(), host, now).state,
    visitor,
    now
  );
  expect(held.state.waiting[guestId]?.displayName).toBe('host (guest)');
  const renamed = run(
    held.state,
    { type: 'presence.join', displayName: 'host' },
    visitor
  );
  expect(renamed.state.waiting[guestId]?.displayName).toBe('host (guest)');
  // An unchanged name does not re-notify managers.
  expect(renamed.toManagers).toHaveLength(0);
  const changed = run(
    renamed.state,
    { type: 'presence.join', displayName: 'host\u3000\u3000again' },
    visitor
  );
  expect(changed.state.waiting[guestId]?.displayName).toBe(
    'host again (guest)'
  );
  expect(changed.toManagers[0]).toMatchObject({
    participants: [
      expect.objectContaining({ displayName: 'host again (guest)' }),
    ],
  });
});

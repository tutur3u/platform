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
  time = now
) => applyMeetRoomCommand(state, { message, token: as, now: time });
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
      displayName: 'speaker',
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

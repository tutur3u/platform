import { expect, it } from 'vitest';
import { getMeetRealtimeScopesForRole } from './permissions';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  releaseParticipant,
} from './room';

const now = '2026-09-07T14:00:00.000Z';
const expiry = Date.parse(now) + 6 * 60 * 60_000;
const id = (value: string) =>
  `9b5c036d-d38d-4c12-b8e8-${value.padStart(12, '0')}`;
const token = (role: 'host' | 'speaker', fields = {}) =>
  meetRealtimeTokenPayloadSchema.parse({
    role,
    admission: role === 'host' ? 'open' : 'lobby',
    userId: id(role === 'host' ? '1' : '2'),
    displayName: 'Participant',
    roomId: 'epoch',
    meetingId: id('3'),
    wsId: id('4'),
    exp: 2_000_000_000,
    scopes: getMeetRealtimeScopesForRole(role),
    ...fields,
  });
const host = token('host', { limits: { maxRoomDurationSeconds: 8 * 60 * 60 } });
const guest = token('speaker', { guest: true });
const verified = { ...guest, guestTurnstileVerified: true as const };
const eventGuest = { ...guest, guestEventProof: expiry };
const room = admitOrHold(createMeetRoomSnapshot(), host, now).state;
const eventRoom = {
  ...room,
  settings: { shareNotes: false, eventModeExpiresAt: expiry },
};
const admit = (state: typeof room, visitor: typeof guest) =>
  applyMeetRoomCommand(admitOrHold(state, visitor, now).state, {
    message: { type: 'admission.decide', userId: guest.userId, admit: true },
    token: host,
    now,
  }).state;

it.each([eventGuest, verified])(
  'keeps event approval out of ordinary reconnects at natural expiry',
  (visitor) => {
    const admitted = admit(eventRoom, visitor);
    expect(admitted.approved?.[guest.userId]?.admissionEventExpiresAt).toBe(
      expiry
    );
    expect(
      admitOrHold(admitted, visitor, now).state.presence[guest.userId]
    ).toBeDefined();
    const disconnected = releaseParticipant(
      admitted,
      guest.userId,
      host.roomId,
      now
    ).state;
    for (const state of [admitted, disconnected]) {
      for (const ordinary of [guest, verified]) {
        const reconnect = admitOrHold(
          state,
          ordinary,
          new Date(expiry).toISOString()
        ).state;
        expect(reconnect.presence[guest.userId]).toBeUndefined();
        expect(reconnect.waiting[guest.userId]).toBeDefined();
        expect(
          reconnect.approved?.[guest.userId]?.admissionEventExpiresAt
        ).toBe(expiry);
      }
    }
  }
);

it('requires event approval even for an ordinarily approved verified guest', () => {
  const ordinary = admit(room, verified);
  const active = { ...ordinary, settings: eventRoom.settings };
  for (const state of [
    active,
    releaseParticipant(active, guest.userId, host.roomId, now).state,
  ]) {
    const reconnect = admitOrHold(state, verified, now).state;
    expect(reconnect.presence[guest.userId]).toBeUndefined();
    expect(reconnect.waiting[guest.userId]).toBeDefined();
  }
  const skip = {
    ...active,
    settings: {
      ...active.settings,
      skipLobby: true,
      allowAnonymousGuests: true,
    },
  };
  const accepted = admitOrHold(skip, verified, now).state;
  expect(accepted.presence[guest.userId]).toBeDefined();
  expect(accepted.approved?.[guest.userId]?.admissionEventExpiresAt).toBe(
    expiry
  );
});

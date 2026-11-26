import { describe, expect, it } from 'vitest';
import type { MeetRealtimeClientMessage } from './messages';
import { getMeetRealtimeScopesForRole } from './permissions';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
} from './room';

const now = '2026-09-07T14:00:00.000Z';
const id = (n: number) =>
  `9b5c036d-d38d-4c12-b8e8-${String(n).padStart(12, '0')}`;
const token = (n: number, overrides: Record<string, unknown> = {}) => {
  const role = n === 1 ? 'host' : 'speaker';
  return meetRealtimeTokenPayloadSchema.parse({
    role,
    admission: role === 'host' ? 'open' : 'lobby',
    userId: id(n),
    accountId: id(n),
    displayName: `person ${n}`,
    roomId: 'test',
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    exp: 2_000_000_000,
    limits: {},
    scopes: getMeetRealtimeScopesForRole(role),
    ...overrides,
  });
};
const host = token(1);
const member = token(2);
const guest = token(3, { guest: true });
const other = token(4);
const run = (
  state: ReturnType<typeof createMeetRoomSnapshot>,
  message: MeetRealtimeClientMessage,
  as = host
) =>
  applyMeetRoomCommand(state, {
    message,
    token: as,
    now,
    notesEligible: true,
  });
const hosted = () => admitOrHold(createMeetRoomSnapshot(), host, now).state;
const skip = (on: boolean, requestId?: string) =>
  ({
    type: 'room.settings.update',
    settings: { skipLobby: on },
    ...(requestId ? { requestId } : {}),
  }) satisfies MeetRealtimeClientMessage;

describe('automatic admission of signed-in people', () => {
  it('admits a signed-in person who arrives after the host turned it on', () => {
    const on = run(hosted(), skip(true)).state;
    const joined = admitOrHold(on, member, now);
    expect(joined.state.presence[member.userId]).toBeDefined();
    expect(joined.state.waiting[member.userId]).toBeUndefined();
  });

  it('admits the signed-in people already waiting when it turns on, not guests', () => {
    let state = hosted();
    for (const person of [member, guest, other])
      state = admitOrHold(state, person, now).state;
    expect(Object.keys(state.waiting)).toHaveLength(3);
    const result = run(state, skip(true));
    expect(Object.keys(result.state.presence).sort()).toEqual(
      [host.userId, member.userId, other.userId].sort()
    );
    expect(Object.keys(result.state.waiting)).toEqual([guest.userId]);
    expect(
      result.direct
        .filter((entry) => entry.message.type === 'admission.result')
        .map((entry) => entry.userId)
        .sort()
    ).toEqual([member.userId, other.userId].sort());
    expect(result.toManagers.map((message) => message.type)).toContain(
      'admission.pending'
    );
    expect(result.broadcast.map((message) => message.type)).toContain(
      'presence'
    );
    expect(result.broadcast.map((message) => message.type)).toContain(
      'room.settings'
    );
  });

  it('keeps a denied account waiting and leaves everyone alone when it turns off', () => {
    let state = hosted();
    state = admitOrHold(state, member, now).state;
    state = admitOrHold(state, other, now).state;
    state = run(state, {
      type: 'admission.decide',
      userId: member.userId,
      admit: false,
    }).state;
    state = admitOrHold(state, member, now).state;
    const turnedOn = run(state, skip(true));
    expect(turnedOn.state.presence[other.userId]).toBeDefined();
    expect(turnedOn.state.waiting[member.userId]).toBeDefined();
    const off = run(turnedOn.state, skip(false));
    expect(off.state.presence[other.userId]).toBeDefined();
    expect(off.direct).toEqual([]);
  });

  it('does not admit anyone while admission is closed', () => {
    const state = admitOrHold(hosted(), member, now).state;
    const result = run(state, {
      type: 'room.settings.update',
      settings: { skipLobby: true, admissionClosed: true },
    });
    expect(result.state.waiting[member.userId]).toBeDefined();
  });

  it('answers the sender with the settings the room holds', () => {
    const result = run(hosted(), skip(true, 'req-1'));
    expect(result.reply).toEqual([
      {
        type: 'room.settings',
        settings: expect.objectContaining({ skipLobby: true }),
        features: ['joinQr'],
        serverNow: expect.any(String),
        requestId: 'req-1',
      },
    ]);
    expect(run(hosted(), skip(true)).reply).toEqual([]);
  });

  it('refuses a non-host and names the request in the refusal', () => {
    const state = admitOrHold(hosted(), member, now).state;
    const admitted = run(state, {
      type: 'admission.decide',
      userId: member.userId,
      admit: true,
    }).state;
    const refused = run(admitted, skip(true, 'req-2'), member);
    expect(refused.state.settings?.skipLobby).toBeUndefined();
    expect(refused.reply).toEqual([
      { type: 'error', error: 'permission_denied', requestId: 'req-2' },
    ]);
  });
});

describe('event room admission', () => {
  const staff = token(1, { eventHost: true });
  const enable = {
    type: 'room.settings.update',
    settings: { eventMode: true },
  } satisfies MeetRealtimeClientMessage;
  const eventRoom = () => run(hosted(), enable, staff).state;

  it('requires explicit staff-host enablement and records the six-hour expiry', () => {
    expect(
      run(hosted(), enable).state.settings?.eventModeExpiresAt
    ).toBeUndefined();
    const state = eventRoom();
    const expiresAt = Date.parse(now) + 6 * 60 * 60_000;
    expect(state.settings?.eventModeExpiresAt).toBe(expiresAt);
    expect(state.eventAdmissionAudit).toEqual([
      { action: 'event_enabled', actorId: staff.userId, at: now, expiresAt },
    ]);
    expect(run(state, enable, staff).state.eventAdmissionAudit).toHaveLength(1);
    expect(
      admitOrHold(state, guest, new Date(expiresAt).toISOString()).state
        .waiting[guest.userId]
    ).toBeDefined();
  });

  it('requires current proof for manual admission and preserves verified skip-lobby', () => {
    const event = eventRoom();
    const state = run(
      event,
      {
        type: 'room.settings.update',
        settings: { skipLobby: true, allowAnonymousGuests: true },
      },
      staff
    ).state;
    expect(admitOrHold(state, guest, now).disconnect).toContain(guest.userId);
    const manual = {
      ...guest,
      guestEventProof: state.settings?.eventModeExpiresAt,
    };
    const waiting = admitOrHold(state, manual, now).state;
    expect(waiting.presence[guest.userId]).toBeUndefined();
    expect(waiting.waiting[guest.userId]).toBeDefined();
    const optedIn = token(5, { guest: true, guestTurnstileVerified: true });
    expect(
      admitOrHold(waiting, optedIn, now).state.presence[optedIn.userId]
    ).toBeDefined();
    expect(
      admitOrHold(waiting, member, now).state.presence[member.userId]
    ).toBeDefined();
    const admitted = run(
      waiting,
      { type: 'admission.decideAll', admit: true },
      staff
    ).state;
    expect(admitted.presence[guest.userId]).toBeDefined();
    expect(admitted.eventAdmissionAudit?.at(-1)).toMatchObject({
      action: 'admit_all_waiting',
      actorId: staff.userId,
      admitted: 1,
    });
  });

  it('caps simultaneous waiting and admitted guest connections only during the event', () => {
    let state = eventRoom();
    for (let n = 10; n < 90; n++) {
      const candidate = token(n, {
        guest: true,
        guestEventProof: state.settings?.eventModeExpiresAt,
      });
      state = admitOrHold(state, candidate, now).state;
    }
    expect(Object.keys(state.waiting)).toHaveLength(80);
    const last = token(90, {
      guest: true,
      guestEventProof: state.settings?.eventModeExpiresAt,
    });
    expect(admitOrHold(state, last, now).disconnect).toContain(last.userId);
    expect(
      admitOrHold(
        state,
        last,
        new Date(state.settings!.eventModeExpiresAt!).toISOString()
      ).state.waiting[last.userId]
    ).toBeDefined();
  });
});

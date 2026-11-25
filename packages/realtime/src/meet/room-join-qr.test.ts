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
} from './room';
import { isMeetJoinQrShown, meetJoinQrHidesAt } from './room-join-qr';
import { resolveRoomSettingsPatch } from './room-settings-gate';

const hostId = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const guestId = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
const now = '2026-11-25T08:00:00.000Z';
const at = Date.parse(now);
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
const host = token('host');
const guest = token('speaker');
const cohost = { ...guest, scopes: [...guest.scopes, 'participants:manage'] };
const run = (
  state: ReturnType<typeof createMeetRoomSnapshot>,
  message: MeetRealtimeClientMessage,
  as = host,
  time = now
) =>
  applyMeetRoomCommand(state, {
    message,
    token: as,
    now: time,
    notesEligible: true,
  });
function admitted() {
  const hosting = admitOrHold(createMeetRoomSnapshot(), host, now).state;
  const waiting = admitOrHold(hosting, guest, now).state;
  return run(waiting, {
    type: 'admission.decide',
    userId: guestId,
    admit: true,
  }).state;
}

describe('stage join QR settings', () => {
  it('lets hosts and co-hosts hide and show the QR, not participants', () => {
    const state = admitted();
    const hide = {
      type: 'room.settings.update',
      settings: { joinQrHidden: true },
    } satisfies MeetRealtimeClientMessage;
    expect(
      run(state, hide, guest).state.settings?.joinQrHidden
    ).toBeUndefined();
    expect(run(state, hide, cohost).state.settings?.joinQrHidden).toBe(true);
    expect(run(state, hide, host).state.settings?.joinQrHidden).toBe(true);
  });

  it('stamps the room time when a manager changes the QR', () => {
    const state = admitted();
    const later = '2026-11-25T08:03:00.000Z';
    const set = run(
      state,
      { type: 'room.settings.update', settings: { joinQrAutoHide: 5 } },
      cohost,
      later
    ).state.settings;
    expect(set).toMatchObject({ joinQrAutoHide: 5, joinQrShownAt: later });
    const other = run(
      state,
      { type: 'room.settings.update', settings: { advancedTools: 'everyone' } },
      host,
      later
    ).state.settings;
    expect(other?.joinQrShownAt).toBeUndefined();
  });

  it('rejects auto-hide values outside Off, 2, 5 and 10 minutes', () => {
    const parse = (joinQrAutoHide: unknown) =>
      meetRealtimeClientMessageSchema.safeParse({
        type: 'room.settings.update',
        settings: { joinQrAutoHide },
      }).success;
    expect([null, 2, 5, 10].map(parse)).toEqual([true, true, true, true]);
    expect([0, 1, 15, '5'].map(parse)).toEqual([false, false, false, false]);
  });

  it('stamps the HTTP settings write too', () => {
    const settings = resolveRoomSettingsPatch(
      { joinQrHidden: false },
      { shareNotes: false, joinQrHidden: true },
      host,
      {}
    );
    expect(settings).not.toBeInstanceOf(Response);
    expect(settings).toMatchObject({ joinQrHidden: false });
    expect(
      Date.parse((settings as { joinQrShownAt: string }).joinQrShownAt)
    ).not.toBeNaN();
  });
});

describe('isMeetJoinQrShown', () => {
  it('shows the QR by default and hides it when a manager does', () => {
    expect(isMeetJoinQrShown(undefined, at)).toBe(true);
    expect(isMeetJoinQrShown({}, at)).toBe(true);
    expect(isMeetJoinQrShown({ joinQrHidden: true }, at)).toBe(false);
  });

  it('hides the QR once the auto-hide minutes pass', () => {
    const settings = { joinQrAutoHide: 2 as const, joinQrShownAt: now };
    expect(meetJoinQrHidesAt(settings)).toBe(at + 120_000);
    expect(isMeetJoinQrShown(settings, at + 119_999)).toBe(true);
    expect(isMeetJoinQrShown(settings, at + 120_000)).toBe(false);
    expect(
      isMeetJoinQrShown({ ...settings, joinQrAutoHide: null }, at + 600_000)
    ).toBe(true);
  });
});

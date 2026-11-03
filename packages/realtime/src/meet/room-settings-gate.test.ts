import { describe, expect, it } from 'vitest';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import { resolveRoomSettingsPatch, roomCommand } from './room-settings-gate';

const wsId = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const base = {
  exp: 2000000000,
  limits: {},
  meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
  mode: 'call',
  roomId: 'room',
  scopes: [],
  userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  wsId,
};
const host = meetRealtimeTokenPayloadSchema.parse({ ...base, role: 'host' });
const guest = meetRealtimeTokenPayloadSchema.parse({
  ...base,
  role: 'speaker',
});
const listed = { MEET_AI_ENABLED_WORKSPACE_IDS: ` x, ${wsId.toUpperCase()} ` };
const status = (result: unknown) =>
  result instanceof Response ? result.status : 'settings';

describe('room-state settings write (authoritative note-sharing gate)', () => {
  it('denies enabling note sharing for unlisted or unconfigured workspaces', () => {
    for (const env of [undefined, {}, { MEET_AI_ENABLED_WORKSPACE_IDS: 'x' }]) {
      for (const body of [
        { shareNotes: true },
        { shareNotesAfterMeeting: true },
      ])
        expect(
          status(resolveRoomSettingsPatch(body, undefined, host, env))
        ).toBe(403);
    }
  });
  it('allows enabling for a listed workspace', () => {
    const result = resolveRoomSettingsPatch(
      { shareNotes: true },
      undefined,
      host,
      listed
    );
    expect(result).toMatchObject({ shareNotes: true });
  });
  it('always allows turning sharing off and unrelated settings', () => {
    expect(
      resolveRoomSettingsPatch(
        { shareNotes: false },
        { shareNotes: true },
        host,
        undefined
      )
    ).toMatchObject({ shareNotes: false });
    expect(
      resolveRoomSettingsPatch({ saveChat: true }, undefined, host, undefined)
    ).toMatchObject({ saveChat: true });
  });
  it('keeps the host-only and validation rules', () => {
    expect(
      status(
        resolveRoomSettingsPatch({ saveChat: true }, undefined, guest, listed)
      )
    ).toBe(403);
    expect(
      status(
        resolveRoomSettingsPatch({ shareNotes: 'yes' }, undefined, host, listed)
      )
    ).toBe(400);
  });
  it('derives command eligibility from the injected binding only', () => {
    const message = { type: 'presence.join' as const };
    expect(roomCommand(message, host, listed).notesEligible).toBe(true);
    expect(roomCommand(message, host, undefined).notesEligible).toBe(false);
    expect(
      roomCommand(message, host, { MEET_AI_ENABLED_WORKSPACE_IDS: 'x' })
        .notesEligible
    ).toBe(false);
  });
});

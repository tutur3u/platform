import { describe, expect, it } from 'vitest';
import { isSelfSession, ROOM_ONLY, readSelfRoom } from './self-room';

const base = {
  available: true as const,
  version: 'v',
  choice: 'allow' as const,
  fence: { ready: true, pending: 0, declined: 0, admitted: 1 },
  active: true,
  activeSince: 1,
};

describe('per-speaker room view', () => {
  it('treats a view without the fields as room capture', () => {
    expect(readSelfRoom(base)).toEqual(ROOM_ONLY);
    expect(readSelfRoom(undefined)).toEqual(ROOM_ONLY);
    expect(readSelfRoom({ available: false })).toEqual(ROOM_ONLY);
  });

  it('ignores malformed fields', () => {
    const view = {
      ...base,
      mode: 'weird',
      session: { sessionId: 7, protocol: 'self_v1' },
      perSpeakerAvailable: 'yes',
    };
    const room = readSelfRoom(view as never);
    expect(room.mode).toBe('room');
    expect(room.session).toBeNull();
    expect(room.available).toBe(false);
  });

  it('reads the mode, session and coverage the server reports', () => {
    const room = readSelfRoom({
      ...base,
      mode: 'self',
      perSpeakerAvailable: true,
      canManageMode: true,
      session: { sessionId: 's', protocol: 'self_v1' },
      coverage: [{ accountId: 'a', contributing: true }, { nope: 1 }],
    } as never);
    expect(room).toMatchObject({
      mode: 'self',
      available: true,
      canManageMode: true,
      coverage: [{ accountId: 'a', contributing: true }],
    });
    expect(isSelfSession(room)).toBe(true);
    expect(isSelfSession(ROOM_ONLY)).toBe(false);
  });
});

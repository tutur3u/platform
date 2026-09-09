import { describe, expect, it } from 'vitest';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import { admitOrHold, createMeetRoomSnapshot } from './room';
import { roomService } from './room-service';

const token = meetRealtimeTokenPayloadSchema.parse({
  userId: '00000000-0000-4000-8000-000000000001',
  wsId: '00000000-0000-4000-8000-000000000003',
  meetingId: '00000000-0000-4000-8000-000000000004',
  roomId: 'room',
  role: 'host',
  mode: 'call',
  admission: 'open',
  limits: {},
  scopes: ['meet:server', 'meet:live-server'],
  exp: 2000000000,
});
const report = {
  action: 'live.usage',
  id: '00000000-0000-4000-8000-000000000002',
  sequence: 0,
  costUsd: 0,
  incomplete: true,
};
const initial = () =>
  admitOrHold(createMeetRoomSnapshot(), token, new Date().toISOString()).state;
describe('Live provider accounting', () => {
  it('rejects browser service tokens and absent participants', () => {
    expect(
      roomService(initial(), { ...token, scopes: ['meet:server'] }, report)
        .status
    ).toBe(403);
    expect(roomService(createMeetRoomSnapshot(), token, report).status).toBe(
      403
    );
  });
  it('settles registered usage after a room ends without double counting replay', () => {
    const registered = roomService(initial(), token, report).state;
    const ended = { ...registered, ended: true, presence: {} };
    const settled = roomService(ended, token, {
      ...report,
      sequence: 2,
      costUsd: 0.25,
      incomplete: false,
    }).state;
    const replay = roomService(settled, token, {
      ...report,
      sequence: 1,
      costUsd: 0.1,
    }).state;
    expect(replay).toBe(settled);
    expect(roomService(replay, token, { action: 'costs' }).body).toMatchObject({
      live: { sessions: 1, costUsd: 0.25, incomplete: 0 },
    });
  });
  it('keeps costs admin-only and rejects another owner overwriting a billing period', () => {
    const registered = roomService(initial(), token, report).state;
    expect(
      roomService(
        registered,
        { ...token, userId: 'other' },
        { ...report, sequence: 1 }
      ).status
    ).toBe(403);
    expect(
      roomService(
        registered,
        { ...token, role: 'speaker' },
        { action: 'costs' }
      ).status
    ).toBe(403);
  });
});

import { describe, expect, it } from 'vitest';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
  releaseParticipant,
} from './index';

const now = '2026-09-09T12:00:00.000Z';
const token = meetRealtimeTokenPayloadSchema.parse({
  exp: Date.parse(now) / 1000 + 600,
  limits: {},
  meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
  mode: 'call',
  role: 'host',
  roomId: 'workspace:meeting',
  scopes: getMeetRealtimeScopesForRole('host'),
  userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
});
describe('same-device signaling recovery', () => {
  it('retains media state and original join time during a socket reconnect', () => {
    const initial = admitOrHold(createMeetRoomSnapshot(), token, now);
    initial.state.presence[token.userId]!.media = {
      audioEnabled: true,
      videoEnabled: true,
      screenEnabled: false,
    };
    const resumed = admitOrHold(
      initial.state,
      token,
      '2026-09-09T12:00:10.000Z'
    );
    const announced = applyMeetRoomCommand(resumed.state, {
      token,
      now: '2026-09-09T12:00:11.000Z',
      message: {
        type: 'presence.join',
        media: initial.state.presence[token.userId]!.media,
      },
    });
    expect(announced.state.presence[token.userId]?.joinedAt).toBe(now);
    expect(initial.reply[0]).toMatchObject({ resumed: false });
    expect(resumed.reply[0]).toMatchObject({ resumed: true });
    expect(resumed.state.presence[token.userId]).toMatchObject({
      joinedAt: now,
      media: { audioEnabled: true, videoEnabled: true },
    });
  });
  it('requires fresh media after the participant has actually left', () => {
    const initial = admitOrHold(createMeetRoomSnapshot(), token, now);
    const left = releaseParticipant(initial.state, token.userId, token.roomId);
    const rejoined = admitOrHold(left.state, token, now);
    expect(rejoined.reply[0]).toMatchObject({ resumed: false });
  });
});

import { expect, it } from 'vitest';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  getMeetRealtimeScopesForRole,
  meetRealtimeTokenPayloadSchema,
} from './index';

const NOW = '2026-09-23T00:00:00.000Z';
function token() {
  return meetRealtimeTokenPayloadSchema.parse({
    userId: '00000000-0000-4000-8000-000000000010',
    wsId: '00000000-0000-4000-8000-000000000011',
    meetingId: '00000000-0000-4000-8000-000000000012',
    roomId: 'room',
    role: 'host',
    exp: 2000000000,
    scopes: getMeetRealtimeScopesForRole('host'),
  });
}
function run(
  state: ReturnType<typeof createMeetRoomSnapshot>,
  message: Parameters<typeof applyMeetRoomCommand>[1]['message'],
  as: ReturnType<typeof token>
) {
  return applyMeetRoomCommand(state, { message, now: NOW, token: as });
}
it('keeps Mira audio preferences independent from meeting media and preserves them on rejoin', () => {
  const host = token();
  const admitted = admitOrHold(createMeetRoomSnapshot(), host, NOW).state;
  const audio = { microphoneEnabled: false, speakerEnabled: true };
  const changed = run(
    admitted,
    { type: 'assistant.preferences', audio },
    host
  ).state;
  expect(changed.presence[host.userId]?.assistantAudio).toEqual(audio);
  expect(changed.presence[host.userId]?.media).toEqual(
    admitted.presence[host.userId]?.media
  );
  const joined = run(changed, { type: 'presence.join' }, host).state;
  expect(joined.presence[host.userId]?.assistantAudio).toEqual(audio);
});

it('rejects microphone consent replayed from an earlier Mira session', () => {
  const host = token();
  const state = admitOrHold(createMeetRoomSnapshot(), host, NOW).state;
  state.liveAssistant = {
    sessionId: '00000000-0000-4000-8000-000000000013',
    ownerId: host.userId,
    expiresAt: Date.now() + 90000,
    sequence: 0,
  };
  const result = run(
    state,
    {
      type: 'assistant.preferences',
      audio: {
        sessionId: '00000000-0000-4000-8000-000000000014',
        microphoneEnabled: true,
        speakerEnabled: true,
      },
    },
    host
  );
  expect(
    result.state.presence[host.userId]?.assistantAudio?.microphoneEnabled
  ).not.toBe(true);
});

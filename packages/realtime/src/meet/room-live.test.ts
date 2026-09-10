import { describe, expect, it } from 'vitest';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import { admitOrHold, createMeetRoomSnapshot } from './room';
import { expireRoomLive } from './room-live';
import { roomService } from './room-service';

const ownerId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const token = meetRealtimeTokenPayloadSchema.parse({
  userId: ownerId,
  accountId: ownerId,
  wsId: '00000000-0000-4000-8000-000000000003',
  meetingId: '00000000-0000-4000-8000-000000000004',
  roomId: 'room',
  role: 'host',
  mode: 'call',
  admission: 'open',
  limits: {},
  scopes: ['meet:server'],
  exp: 2000000000,
});
const initial = () =>
  admitOrHold(createMeetRoomSnapshot(), token, new Date().toISOString()).state;
describe('room Live authority', () => {
  it('requires admission even with a signed service token', () => {
    expect(
      roomService(createMeetRoomSnapshot(), token, { action: 'live.context' })
        .status
    ).toBe(403);
  });
  it('allows one room assistant and requires an admin to invite it', () => {
    expect(
      roomService(
        initial(),
        { ...token, role: 'speaker' },
        { action: 'live.reserve', sessionId }
      ).status
    ).toBe(403);
    const first = roomService(initial(), token, {
      action: 'live.reserve',
      sessionId,
    });
    expect(first.status).toBeUndefined();
    expect(
      roomService(first.state, token, {
        action: 'live.reserve',
        sessionId: crypto.randomUUID(),
      }).status
    ).toBe(409);
  });
  it('does not allow host browser tokens to impersonate assistant audio', () => {
    const first = roomService(initial(), token, {
      action: 'live.reserve',
      sessionId,
    });
    const command = {
      action: 'live.audio',
      sessionId,
      sequence: 0,
      data: 'AAAA',
      at: Date.now(),
    };
    expect(roomService(first.state, token, command).status).toBe(403);
    const result = roomService(
      first.state,
      { ...token, scopes: ['meet:server', 'meet:live-server'] },
      command
    );
    expect(result.messages?.[0]?.type).toBe('assistant.audio');
    expect(
      roomService(
        result.state,
        { ...token, scopes: ['meet:server', 'meet:live-server'] },
        command
      ).messages
    ).toBeUndefined();
  });
  it('rejects shared speech without a server-issued disclosure grant', () => {
    const command = {
      action: 'live.share.audio',
      id: sessionId,
      sequence: 0,
      data: 'AAAA',
      at: Date.now(),
    };
    const server = { ...token, scopes: ['meet:server', 'meet:live-server'] };
    expect(roomService(initial(), server, command).status).toBe(409);
    expect(
      roomService(initial(), token, {
        action: 'live.share',
        id: sessionId,
        text: 'Approved text',
      }).status
    ).toBe(403);
    const shared = roomService(initial(), server, {
      action: 'live.share',
      id: sessionId,
      text: 'Approved text',
    });
    expect(shared.messages?.[0]).toMatchObject({
      type: 'chat.message',
      assistant: true,
      body: 'Approved text',
    });
    expect(roomService(shared.state, server, command).messages?.[0]?.type).toBe(
      'assistant.audio'
    );
  });
});

it('expires an abandoned room assistant and emits a single removal event', () => {
  const first = roomService(initial(), token, {
    action: 'live.reserve',
    sessionId,
  });
  const expiry = first.state.liveAssistant!.expiresAt;
  expect(expireRoomLive(first.state, expiry - 1)).toBeNull();
  const expired = expireRoomLive(first.state, expiry)!;
  expect(expired.messages).toEqual([
    { type: 'assistant.live', sessionId, ownerId, active: false },
  ]);
  expect(expireRoomLive(expired.state, expiry)).toBeNull();
});
it('allows authenticated server interruptions but rejects browser impersonation', () => {
  const first = roomService(initial(), token, {
    action: 'live.reserve',
    sessionId,
  });
  const command = { action: 'live.interrupt', sessionId };
  expect(roomService(first.state, token, command).status).toBe(403);
  expect(
    roomService(
      first.state,
      { ...token, scopes: ['meet:server', 'meet:live-server'] },
      command
    ).messages
  ).toEqual([{ type: 'assistant.interrupted', sessionId }]);
});

it('rejects a pre-interruption packet that arrives after the server sequence fence', () => {
  const reserved = roomService(initial(), token, {
    action: 'live.reserve',
    sessionId,
  });
  const service = { ...token, scopes: ['meet:server', 'meet:live-server'] };
  const interrupted = roomService(reserved.state, service, {
    action: 'live.interrupt',
    sessionId,
    sequence: 10,
  });
  const stale = roomService(interrupted.state, service, {
    action: 'live.audio',
    sessionId,
    sequence: 9,
    at: Date.now(),
    data: 'AAAA',
  });
  expect(
    stale.messages?.some((message) => message.type === 'assistant.audio')
  ).not.toBe(true);
  const fresh = roomService(interrupted.state, service, {
    action: 'live.audio',
    sessionId,
    sequence: 11,
    at: Date.now(),
    data: 'AAAA',
  });
  expect(fresh.messages?.[0]?.type).toBe('assistant.audio');
});

it('acknowledges cleanup after expiry, departure, or room end without affecting a newer session', () => {
  const reserved = roomService(initial(), token, {
    action: 'live.reserve',
    sessionId,
  });
  const ended = {
    ...reserved.state,
    ended: true,
    presence: {},
    liveAssistant: { ...reserved.state.liveAssistant!, expiresAt: 1 },
  };
  const stopped = roomService(ended, token, { action: 'live.stop', sessionId });
  expect(stopped.status).toBeUndefined();
  expect(stopped.state.liveAssistant).toBeUndefined();
  expect(
    roomService(stopped.state, token, { action: 'live.stop', sessionId }).status
  ).toBeUndefined();
  const newer = roomService(initial(), token, {
    action: 'live.reserve',
    sessionId: crypto.randomUUID(),
  });
  expect(
    roomService(newer.state, token, { action: 'live.stop', sessionId }).state
      .liveAssistant
  ).toEqual(newer.state.liveAssistant);
});

import { describe, expect, it } from 'vitest';
import {
  consumeRate,
  isInboxEvent,
  isStopped,
  LIMITS,
  parseClientFrame,
  parseSince,
  parseTicketProtocol,
  readBounded,
  type SocketAttachment,
} from './protocol';

const attachment = (): SocketAttachment => ({
  count: 0,
  exp: 2_000_000_000,
  state: 'foreground',
  userId: '00000000-0000-4000-8000-000000000001',
  windowStart: 0,
});

describe('chat realtime protocol', () => {
  it('reads the ticket only alongside the chat subprotocol', () => {
    expect(parseTicketProtocol('tuturuuu.chat.v1, ticket.abc.def')).toBe(
      'abc.def'
    );
    expect(parseTicketProtocol('ticket.abc.def')).toBeNull();
    expect(parseTicketProtocol('tuturuuu.chat.v1')).toBeNull();
    expect(parseTicketProtocol(null)).toBeNull();
    expect(
      parseTicketProtocol(`tuturuuu.chat.v1, ticket.${'a'.repeat(9000)}`)
    ).toBeNull();
  });

  it('accepts only typing and presence frames within the size cap', () => {
    expect(parseClientFrame('{"t":"typing","on":true}')).toEqual({
      on: true,
      t: 'typing',
    });
    expect(parseClientFrame('{"t":"presence","state":"background"}')).toEqual({
      state: 'background',
      t: 'presence',
    });
    expect(parseClientFrame('{"t":"presence","state":"offline"}')).toBeNull();
    expect(parseClientFrame('{"t":"event","event":{}}')).toBeNull();
    expect(parseClientFrame('not json')).toBeNull();
    expect(parseClientFrame(new ArrayBuffer(4))).toBeNull();
    expect(
      parseClientFrame(
        JSON.stringify({ on: true, pad: 'x'.repeat(3000), t: 'typing' })
      )
    ).toBe('too-big');
  });

  it('caps inbound frames per socket window and resets after it', () => {
    const socket = attachment();
    for (let index = 0; index < LIMITS.framesPerWindow; index += 1) {
      expect(consumeRate(socket, 1_000)).toBe(true);
    }
    expect(consumeRate(socket, 1_000)).toBe(false);
    expect(consumeRate(socket, 1_000 + LIMITS.windowMs)).toBe(true);
    expect(socket.count).toBe(1);
  });

  it('treats only explicit true values as stopped', () => {
    expect(isStopped({ CHAT_REALTIME_STOPPED: 'true' })).toBe(true);
    expect(isStopped({ CHAT_REALTIME_STOPPED: ' TRUE ' })).toBe(true);
    expect(isStopped({ CHAT_REALTIME_STOPPED: '1' })).toBe(true);
    expect(isStopped({ CHAT_REALTIME_STOPPED: 'false' })).toBe(false);
    expect(isStopped({})).toBe(false);
  });

  it('parses only bounded non-negative sequence numbers', () => {
    expect(parseSince('0')).toBe(0);
    expect(parseSince('42')).toBe(42);
    for (const bad of [null, '', '-1', '1.5', 'x', '9'.repeat(16)]) {
      expect(parseSince(bad)).toBeNull();
    }
  });

  it('keeps conversation-only events out of the inbox', () => {
    const base = {
      audience: { scope: 'workspace' as const },
      id: '00000000-0000-4000-8000-000000000009',
      sentAt: '2026-11-20T00:00:00.000Z',
      wsId: '00000000-0000-4000-8000-000000000002',
    };
    expect(
      isInboxEvent({
        ...base,
        type: 'member.removed',
        userId: '00000000-0000-4000-8000-000000000001',
      })
    ).toBe(false);
    expect(
      isInboxEvent({ ...base, message: {}, type: 'message.created' })
    ).toBe(true);
  });

  it('stops reading a body once it exceeds the limit', async () => {
    const stream = (size: number) =>
      new Response(new Uint8Array(size)).body as ReadableStream<Uint8Array>;
    expect((await readBounded(stream(10), 10)).byteLength).toBe(10);
    await expect(readBounded(stream(11), 10)).rejects.toThrow(/too large/u);
    expect((await readBounded(null, 10)).byteLength).toBe(0);
  });
});

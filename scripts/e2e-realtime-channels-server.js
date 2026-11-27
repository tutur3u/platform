#!/usr/bin/env bun

const { createHmac, randomUUID, timingSafeEqual } = require('node:crypto');

const DEFAULT_PORT = 7829;
const MAX_TOKEN_LENGTH = 16_384;
const MAX_FRAME_BYTES = 3_000_000;

function verifyRealtimePayload(token, secret) {
  if (!secret || !String(secret).trim()) return null;
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH
  ) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!encoded || !signature || !/^[A-Za-z0-9_-]+$/.test(signature)) {
    return null;
  }
  const expected = createHmac('sha256', String(secret).trim())
    .update(encoded)
    .digest();
  const received = Buffer.from(signature, 'base64url');
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function parseChannelTicket(token, secret, expectedKind, nowMs = Date.now()) {
  const payload = verifyRealtimePayload(token, secret);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  if (payload.aud !== 'tuturuuu.channels' || payload.kind !== expectedKind) {
    return null;
  }
  if (
    typeof payload.topic !== 'string' ||
    !/^[a-zA-Z0-9:_-]{1,180}$/.test(payload.topic)
  ) {
    return null;
  }
  if (typeof payload.userId !== 'string' || payload.userId.length === 0) {
    return null;
  }
  if (payload.role !== 'editor' && payload.role !== 'viewer') {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) {
    return null;
  }
  return payload;
}

function parseJoinTicket(token, secret, nowMs = Date.now()) {
  return parseChannelTicket(token, secret, 'join', nowMs);
}

function parsePublishTicket(token, secret, nowMs = Date.now()) {
  const ticket = parseChannelTicket(token, secret, 'publish', nowMs);
  if (!ticket || ticket.role !== 'editor') return null;
  return ticket;
}

function buildPresenceState(sockets) {
  const state = {};
  for (const ws of sockets) {
    if (!ws.data.presence) continue;
    const key = ws.data.ticket.userId;
    if (!state[key]) state[key] = [];
    state[key].push({
      ...ws.data.presence,
      presence_ref: ws.data.id,
    });
  }
  return state;
}

function createChannelsServer({
  port = Number(process.env.E2E_REALTIME_CHANNELS_PORT || DEFAULT_PORT),
  secret = process.env.MEET_REALTIME_TOKEN_SECRET || '',
} = {}) {
  const rooms = new Map();

  function getRoom(topic) {
    let room = rooms.get(topic);
    if (!room) {
      room = new Set();
      rooms.set(topic, room);
    }
    return room;
  }

  function broadcastPresence(topic) {
    const room = rooms.get(topic);
    if (!room || room.size === 0) return;
    const frame = JSON.stringify({
      type: 'presence',
      state: buildPresenceState(room),
    });
    for (const peer of room) {
      peer.send(frame);
    }
  }

  return Bun.serve({
    hostname: '127.0.0.1',
    port,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === '/health') {
        return new Response('ok', { status: 200 });
      }
      if (url.pathname === '/channels/publish') {
        if (request.method !== 'POST') {
          return new Response('Method not allowed', { status: 405 });
        }
        const raw = request.headers
          .get('Authorization')
          ?.match(/^Bearer (\S+)$/)?.[1];
        const ticket = parsePublishTicket(raw, secret);
        if (!ticket) {
          return new Response('Unauthorized', { status: 401 });
        }
        let frame;
        try {
          frame = await request.json();
        } catch {
          return new Response('Invalid request', { status: 400 });
        }
        if (
          !frame ||
          typeof frame !== 'object' ||
          frame.type !== 'broadcast' ||
          typeof frame.event !== 'string' ||
          frame.event.length === 0
        ) {
          return new Response('Invalid broadcast', { status: 400 });
        }
        const room = rooms.get(ticket.topic);
        if (room && room.size > 0) {
          const serialized = JSON.stringify({
            type: 'broadcast',
            event: frame.event,
            payload: frame.payload,
          });
          for (const peer of room) {
            peer.send(serialized);
          }
        }
        return new Response(null, { status: 204 });
      }
      if (url.pathname !== '/channels') {
        return new Response('Not found', { status: 404 });
      }
      const ticket = parseJoinTicket(url.searchParams.get('token'), secret);
      if (!ticket) {
        return new Response('Unauthorized', { status: 401 });
      }
      const upgraded = server.upgrade(request, {
        data: {
          id: randomUUID(),
          presence: null,
          self: url.searchParams.get('self') === 'true',
          ticket,
        },
      });
      if (upgraded) return undefined;
      return new Response('Upgrade required', { status: 426 });
    },
    websocket: {
      maxPayloadLength: MAX_FRAME_BYTES,
      open(ws) {
        const room = getRoom(ws.data.ticket.topic);
        room.add(ws);
        ws.send(
          JSON.stringify({
            type: 'presence',
            state: buildPresenceState(room),
          })
        );
      },
      message(ws, raw) {
        let frame;
        try {
          const text =
            typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
          frame = JSON.parse(text);
        } catch {
          return;
        }
        if (!frame || typeof frame !== 'object') return;
        const topic = ws.data.ticket.topic;
        const room = rooms.get(topic);
        if (!room) return;

        if (frame.type === 'authenticate') {
          const refreshed = parseJoinTicket(frame.token, secret);
          if (
            !refreshed ||
            refreshed.topic !== topic ||
            refreshed.userId !== ws.data.ticket.userId
          ) {
            ws.close(4001, 'Unauthorized');
            return;
          }
          ws.data.ticket = refreshed;
          return;
        }

        if (
          frame.type === 'track' &&
          frame.payload &&
          typeof frame.payload === 'object'
        ) {
          ws.data.presence = frame.payload;
          broadcastPresence(topic);
          return;
        }

        if (frame.type === 'untrack') {
          if (ws.data.presence !== null) {
            ws.data.presence = null;
            broadcastPresence(topic);
          }
          return;
        }

        if (
          frame.type === 'broadcast' &&
          typeof frame.event === 'string' &&
          frame.event.length > 0 &&
          ws.data.ticket.role === 'editor'
        ) {
          const serialized = JSON.stringify({
            type: 'broadcast',
            event: frame.event,
            payload: frame.payload,
          });
          for (const peer of room) {
            if (peer === ws && !ws.data.self) continue;
            peer.send(serialized);
          }
        }
      },
      close(ws) {
        const topic = ws.data.ticket.topic;
        const room = rooms.get(topic);
        if (!room) return;
        const hadPresence = ws.data.presence !== null;
        room.delete(ws);
        if (room.size === 0) {
          rooms.delete(topic);
        } else if (hadPresence) {
          broadcastPresence(topic);
        }
      },
    },
  });
}

if (require.main === module) {
  const server = createChannelsServer();
  console.log(
    `[e2e-realtime-channels] listening on http://127.0.0.1:${server.port}`
  );
  const shutdown = () => {
    server.stop(true);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  createChannelsServer,
  parseJoinTicket,
  parsePublishTicket,
  verifyRealtimePayload,
};

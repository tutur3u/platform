// Raw WebSocket access to Worker rooms with the ticket the Web API issued,
// so the qualification can assert exact frames, cursors and close codes.
import {
  CHAT_REALTIME_SUBPROTOCOL,
  CHAT_REALTIME_TICKET_PROTOCOL_PREFIX,
  chatRealtimeConnectUrl,
} from '../../../../packages/realtime/src/chat/client.ts';
import { check } from './env.mjs';

const OPEN_TIMEOUT_MS = 15_000;

export function realtimeOrigin(ticket) {
  const url = new URL(ticket.url);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  return url.origin;
}

/** Opens a room socket; rejects when the handshake fails or no ready arrives. */
export function openRoom(ticket, { since = null } = {}) {
  check(ticket?.enabled === true, 'ticket is not enabled');
  const socket = new WebSocket(chatRealtimeConnectUrl(ticket.url, since), [
    CHAT_REALTIME_SUBPROTOCOL,
    `${CHAT_REALTIME_TICKET_PROTOCOL_PREFIX}${ticket.ticket}`,
  ]);
  const frames = [];
  const waiters = new Set();
  let closeInfo = null;
  const closed = new Promise((resolve) => {
    socket.addEventListener('close', (event) => {
      closeInfo = { code: event.code };
      resolve(closeInfo);
      for (const waiter of waiters) waiter();
    });
  });
  socket.addEventListener('message', (event) => {
    try {
      frames.push(JSON.parse(event.data));
    } catch {
      frames.push({ t: 'invalid' });
    }
    for (const waiter of waiters) waiter();
  });

  const room = {
    closed,
    frames,
    get closeInfo() {
      return closeInfo;
    },
    send(frame) {
      socket.send(JSON.stringify(frame));
    },
    close() {
      if (socket.readyState <= 1) socket.close(1000);
      return closed;
    },
    /** Resolves with the first frame matching `predicate`, or rejects. */
    waitFor(predicate, description, timeoutMs = 10_000) {
      return new Promise((resolve, reject) => {
        const settle = () => {
          const found = frames.find(predicate);
          if (found) {
            cleanup();
            resolve(found);
          } else if (closeInfo) {
            cleanup();
            reject(
              new Error(`${description}: socket closed ${closeInfo.code}`)
            );
          }
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error(`${description}: timed out`));
        }, timeoutMs);
        const cleanup = () => {
          clearTimeout(timer);
          waiters.delete(settle);
        };
        waiters.add(settle);
        settle();
      });
    },
    /** Asserts nothing matching `predicate` arrives within `ms`. */
    async expectNone(predicate, description, ms = 2_000) {
      await new Promise((resolve) => setTimeout(resolve, ms));
      check(!frames.some(predicate), description);
    },
    lastSeq() {
      return frames.reduce(
        (max, frame) =>
          typeof frame.seq === 'number' ? Math.max(max, frame.seq) : max,
        0
      );
    },
  };

  return new Promise((resolve, reject) => {
    room
      .waitFor((frame) => frame.t === 'ready', 'room ready', OPEN_TIMEOUT_MS)
      .then(() => resolve(room))
      .catch(reject);
  });
}

/** True when a socket with this ticket is refused or closed before ready. */
export async function refused(ticket, options) {
  try {
    const room = await openRoom(ticket, options);
    room.close();
    return false;
  } catch {
    return true;
  }
}

export const eventOf =
  (type, predicate = () => true) =>
  (frame) =>
    frame.t === 'event' && frame.event?.type === type && predicate(frame.event);

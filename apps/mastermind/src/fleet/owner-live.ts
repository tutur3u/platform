import {
  BRIDGE_LIMITS,
  BRIDGE_SUBPROTOCOL,
  type BridgeOwnerFrame,
  bridgeOwnerFrameSchema,
} from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import { openOwnerLiveTicket } from './owner-live-server';

type Listener = (frame: BridgeOwnerFrame) => void;

const listeners = new Set<Listener>();
const revisions = new Map<string, number>();
const MAX_REVISIONS = 128;
const MAX_ATTEMPTS = 3;
const RETRY_MS = 15_000;
const STABLE_CONNECTION_MS = 60_000;
let socket: WebSocket | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;
let handshake: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let attempts = 0;

function readTicket(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const { url, ticket, expiresAt } = value as Record<string, unknown>;
  if (
    typeof url !== 'string' ||
    url.length > 2048 ||
    typeof ticket !== 'string' ||
    !/^[\w-]{32,128}$/.test(ticket) ||
    typeof expiresAt !== 'string' ||
    !(Date.parse(expiresAt) > Date.now())
  )
    return null;
  const target = URL.parse(url);
  if (
    !target ||
    target.origin !== 'wss://mastermind-store.tuturuuu.com' ||
    target.pathname !== '/v1/bridge/connect' ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  )
    return null;
  return { target, ticket };
}

function deliver(raw: unknown) {
  if (
    typeof raw !== 'string' ||
    raw.length > BRIDGE_LIMITS.maxFrameBytes ||
    new TextEncoder().encode(raw).length > BRIDGE_LIMITS.maxFrameBytes
  )
    return;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return;
  }
  const parsed = bridgeOwnerFrameSchema.safeParse(value);
  if (!parsed.success) return;
  const frame = parsed.data;
  if (frame.t === 'poke') {
    const { machineId, topic, revision } = frame.poke;
    const key = `${machineId}:${topic}`;
    const previous = revisions.get(key);
    if (
      previous === undefined
        ? revisions.size >= MAX_REVISIONS
        : revision <= previous
    )
      return;
    revisions.set(key, revision);
  }
  for (const listener of listeners) listener(frame);
}

function active() {
  return listeners.size > 0 && document.visibilityState === 'visible';
}

function stop() {
  generation++;
  clearTimeout(retry);
  clearTimeout(handshake);
  retry = undefined;
  handshake = undefined;
  socket?.close();
  socket = undefined;
}

function reschedule(current: number) {
  if (current !== generation || !active() || attempts >= MAX_ATTEMPTS) return;
  retry = setTimeout(() => void connect(), RETRY_MS);
}

async function connect() {
  if (!active() || attempts >= MAX_ATTEMPTS) return;
  attempts++;
  const current = ++generation;
  try {
    const ticket = readTicket(await openOwnerLiveTicket());
    if (current !== generation || !active()) return;
    if (!ticket) return reschedule(current);
    const candidate = new WebSocket(ticket.target, [
      BRIDGE_SUBPROTOCOL,
      ticket.ticket,
    ]);
    socket = candidate;
    let openedAt: number | undefined;
    handshake = setTimeout(() => candidate.close(), 10_000);
    candidate.addEventListener('open', () => {
      if (current !== generation) return;
      clearTimeout(handshake);
      openedAt = performance.now();
    });
    candidate.addEventListener('message', (event) => {
      if (current === generation && active()) deliver(event.data);
    });
    candidate.addEventListener(
      'close',
      () => {
        if (current !== generation) return;
        clearTimeout(handshake);
        socket = undefined;
        if (
          openedAt !== undefined &&
          performance.now() - openedAt >= STABLE_CONNECTION_MS
        ) {
          attempts = 0;
        }
        reschedule(current);
      },
      { once: true }
    );
  } catch {
    reschedule(current);
  }
}

function visibilityChanged() {
  stop();
  attempts = 0;
  if (active()) void connect();
}

/** One listen-only socket per tab. Receipts are hints for an authenticated read. */
export function subscribeOwnerLive(listener: Listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', visibilityChanged);
    visibilityChanged();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    document.removeEventListener('visibilitychange', visibilityChanged);
    stop();
    revisions.clear();
  };
}

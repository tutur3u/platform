#!/usr/bin/env node
// Mastermind fleet bridge daemon. Runs on the orchestrator Mac under launchd
// (KeepAlive) and holds one WebSocket open to the Mastermind store Worker's
// fleet bridge, so an owner reply reaches its T3 thread in about a second
// instead of waiting for the publisher's 15-second tick.
//
//   node bridge.mjs --origin https://tuturuuu.com
//
// Each connection needs a single-use ticket, fetched from Web with the
// publisher's signed request. Replies arrive signed by Web; each one is
// verified, delivered steered through the local T3 server (t3-steer.mjs) and
// acknowledged. A reply this machine cannot take yet stays in the bridge
// outbox and is replayed on the next `hello`. It only ever sends text to an
// existing thread: no attachments, no commands, no new threads.
// Runbook: apps/docs/platform/features/mastermind-thread-replies.mdx#fleet-bridge
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SUBPROTOCOL,
  createLedger,
  handleReply,
} from './bridge-core.mjs';
import { slugify } from './fleet-state.mjs';
import { pokesDir, readPokes } from './poke.mjs';
import { defaultPaths, readSecret, signRequest } from './publish.mjs';
import { connectLocalMcp, localT3Paths } from './t3-mcp.mjs';
import { createSendJournal, steerThread } from './t3-steer.mjs';

const TICKET_PATH = '/api/v1/mastermind/fleet/bridge/ticket';
const HTTPS_ORIGIN = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i;
const LOOPBACK_ORIGIN = /^http:\/\/127\.0\.0\.1(:\d+)?$/;
const SOCKET_URL =
  /^(wss:\/\/[a-z0-9.-]+(:\d+)?|ws:\/\/127\.0\.0\.1(:\d+)?)\//i;
const TICKET = /^[\w-]{32,128}$/;
const MAX_FRAME_CHARS = 32 * 1024;
export const BACKOFF = { minMs: 1_000, maxMs: 60_000, stableMs: 30_000 };
const PING_MS = 25_000;
const PONG_GRACE_MS = 10_000;
const HTTP_TIMEOUT_MS = 6_000;
/** Above the bridge's minimum replay interval, so a retry is always served. */
const RETRY_PENDING_MS = 15_000;
const POKE_MIN_INTERVAL_MS = 1_000;
/** The bridge replays at most this many undelivered replies per `hello`. */
const REPLAY_BATCH = 50;
/** An otherwise idle connection still asks this often: 144 requests a day. */
export const SAFETY_HELLO_MS = 10 * 60 * 1000;

export function bridgePaths(home = os.homedir()) {
  const base = defaultPaths(home);
  return {
    ...base,
    ledgerFile: path.join(base.root, 'bridge-replies.jsonl'),
    pokesDir: pokesDir(home),
  };
}

/** Full jitter: a wait between half and all of the current step. */
export function backoffDelay(step, random = Math.random) {
  const ceiling = Math.min(BACKOFF.maxMs, BACKOFF.minMs * 2 ** step);
  return Math.round(ceiling / 2 + (ceiling / 2) * random());
}

/** One signed ticket request; throws a closed code. */
export async function fetchTicket({
  origin,
  secret,
  machineId,
  fetchImpl = fetch,
  now = Date.now,
}) {
  const body = JSON.stringify({ machineId });
  let response;
  try {
    response = await fetchImpl(`${origin}${TICKET_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...signRequest(secret, 'POST', TICKET_PATH, body, now()),
      },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    throw new Error('ticket_unreachable');
  }
  if (!response.ok) throw new Error(`ticket_${response.status}`);
  const issued = await response.json().catch(() => null);
  // The ticket goes to this address only: TLS, or loopback in tests.
  if (
    typeof issued?.url !== 'string' ||
    !SOCKET_URL.test(issued.url) ||
    !TICKET.test(String(issued?.ticket ?? ''))
  )
    throw new Error('ticket_invalid');
  return { url: issued.url, ticket: issued.ticket };
}

/**
 * Runs one connection until it closes. Resolves with how it went, so the
 * caller can pick the next backoff step.
 */
export function runConnection({
  url,
  ticket,
  onReply,
  pokes = () => [],
  hasPending = () => false,
  WebSocketImpl = WebSocket,
  log = () => undefined,
  timers = { setInterval, clearInterval, setTimeout, clearTimeout },
  now = Date.now,
}) {
  return new Promise((resolve) => {
    const socket = new WebSocketImpl(url, [BRIDGE_SUBPROTOCOL, ticket]);
    const openedAt = { value: 0 };
    const sent = new Map();
    const inFlight = new Set();
    let lastPong = now();
    let finished = false;
    const send = (frame) => {
      try {
        socket.send(typeof frame === 'string' ? frame : JSON.stringify(frame));
      } catch {
        // Closing; the outbox keeps whatever was not acknowledged.
      }
    };
    const flushPokes = () => {
      for (const poke of pokes()) {
        const last = sent.get(poke.topic);
        if (
          (last?.revision ?? -1) >= poke.revision ||
          now() - (last?.at ?? 0) < POKE_MIN_INTERVAL_MS
        )
          continue;
        sent.set(poke.topic, { revision: poke.revision, at: now() });
        send({ v: BRIDGE_PROTOCOL_VERSION, t: 'poke', ...poke });
      }
    };
    // Replies received since the last `hello`: a full batch means more wait.
    let batch = 0;
    let lastHello = 0;
    const hello = () => {
      batch = 0;
      lastHello = now();
      send({ v: BRIDGE_PROTOCOL_VERSION, t: 'hello' });
    };
    const ping = timers.setInterval(() => {
      if (now() - lastPong > PING_MS + PONG_GRACE_MS) return socket.close();
      send('ping');
      flushPokes();
    }, PING_MS);
    // Asks again while a reply is waiting for the local T3 server or the last
    // replay came back full. Otherwise only a rare safety request goes out,
    // which recovers a push that was lost or a replay the bridge refused.
    const retry = timers.setInterval(() => {
      if (
        openedAt.value &&
        inFlight.size === 0 &&
        (hasPending() ||
          batch >= REPLAY_BATCH ||
          now() - lastHello >= SAFETY_HELLO_MS)
      )
        hello();
    }, RETRY_PENDING_MS);
    const finish = (reason, code) => {
      if (finished) return;
      finished = true;
      timers.clearInterval(ping);
      timers.clearInterval(retry);
      resolve({
        reason,
        code,
        stable:
          openedAt.value > 0 && now() - openedAt.value >= BACKOFF.stableMs,
        opened: openedAt.value > 0,
      });
    };
    socket.addEventListener('open', () => {
      openedAt.value = now();
      lastPong = now();
      log({ event: 'connected' });
      hello();
      flushPokes();
    });
    socket.addEventListener('message', (event) => {
      lastPong = now();
      const data = event.data;
      if (typeof data !== 'string' || data === 'pong') return;
      if (data.length > MAX_FRAME_CHARS) return;
      let frame;
      try {
        frame = JSON.parse(data);
      } catch {
        return;
      }
      if (frame?.t !== 'reply') return;
      batch++;
      const id = frame?.envelope?.id;
      // The same reply may arrive again from a `hello` while it is handled.
      if (typeof id === 'string' && inFlight.has(id)) return;
      if (typeof id === 'string') inFlight.add(id);
      onReply(frame)
        .then((ack) => {
          if (ack) send(ack);
          log({ event: 'reply', state: ack?.state ?? 'pending' });
        })
        .catch(() => log({ event: 'reply', state: 'error' }))
        .finally(() => inFlight.delete(id));
    });
    socket.addEventListener('close', (event) => finish('closed', event.code));
    socket.addEventListener('error', () => {
      finish('error');
      try {
        socket.close();
      } catch {
        // Never opened.
      }
    });
  });
}

/** Connect, serve, back off, repeat; `signal` stops it. */
export async function runBridge({
  origin,
  secret,
  machineId,
  onReply,
  pokes,
  hasPending,
  fetchImpl,
  WebSocketImpl,
  log = () => undefined,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  random = Math.random,
  signal,
}) {
  let step = 0;
  while (!signal?.aborted) {
    let outcome;
    try {
      const { url, ticket } = await fetchTicket({
        origin,
        secret,
        machineId,
        fetchImpl,
      });
      outcome = await runConnection({
        url,
        ticket,
        onReply,
        pokes,
        hasPending,
        WebSocketImpl,
        log,
      });
      log({ event: 'closed', code: outcome.code ?? outcome.reason });
    } catch (error) {
      log({ event: 'error', code: String(error?.message).slice(0, 40) });
    }
    // A connection that held resets the backoff; anything else doubles it.
    step = outcome?.stable ? 0 : Math.min(step + 1, 6);
    if (signal?.aborted) return;
    await sleep(backoffDelay(step, random));
  }
}

function readConfig(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flag = args.indexOf('--origin');
  const origin =
    flag >= 0 ? args[flag + 1] : process.env.MASTERMIND_FLEET_ORIGIN;
  if (!HTTPS_ORIGIN.test(origin ?? '') && !LOOPBACK_ORIGIN.test(origin ?? ''))
    throw new Error('origin_invalid');
  const paths = bridgePaths();
  const secret = readSecret(paths.secretFile);
  const config = readConfig(paths.configFile);
  const label = config.machineLabel || os.hostname().split('.')[0];
  const machineId = slugify(config.machineId || label, 'local');
  const ledger = createLedger(paths.ledgerFile);
  // Keeps a retried reply from being sent twice across T3 sign-ins.
  const journal = createSendJournal(localT3Paths().journalFile);
  const firstSeen = new Map();
  // One steer at a time: T3 sees replies in the order the owner sent them.
  let chain = Promise.resolve();
  const steer = (input) => {
    const run = chain.then(async () => {
      const session = await connectLocalMcp();
      try {
        return await steerThread(session.call, input, {
          journal,
          bearerId: session.bearerId,
        });
      } finally {
        await session.close();
      }
    });
    chain = run.catch(() => undefined);
    return run;
  };
  // Counts and closed codes only: no ids, thread names or message text.
  const log = (entry) =>
    console.log(JSON.stringify({ at: new Date().toISOString(), ...entry }));
  await runBridge({
    origin,
    secret,
    machineId,
    onReply: (frame) =>
      handleReply(frame, { secret, machineId, ledger, steer, firstSeen }),
    pokes: () => readPokes(paths.pokesDir),
    hasPending: () => firstSeen.size > 0,
    log,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(
      JSON.stringify({ error: String(error?.message ?? error).slice(0, 120) })
    );
    process.exitCode = 1;
  });
}

#!/usr/bin/env node
// Steered delivery into a T3 thread on this machine (or, with `--env`, on a
// linked one): the message is injected into the running turn, or starts a turn
// when the thread is idle. It is never left queued behind a running turn: if
// T3 has to queue it (the turn cannot take input at that instant), the queued
// message is promoted to steering straight away, and the receipt says which
// of the three actually happened.
//
//   node t3-steer.mjs <threadId> <message | -> [--request-id <id>] [--env <environmentId>] [--json]
//
// Exit 0 with the delivery on stdout, 1 on failure (closed-set code on stderr).
// Only existing threads can be addressed; there are no attachments or commands.
// Runbook: apps/docs/platform/features/mastermind-thread-replies.mdx#steered-delivery
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  appendPrivateLine,
  readPrivateFile,
  writePrivateFile,
} from './private-files.mjs';
import { connectLocalMcp, localT3Paths, T3McpError } from './t3-mcp.mjs';

/** T3 accepts up to 120,000 characters; steered messages stay far below it. */
export const STEER_MESSAGE_MAX = 16_000;
// These become CLI arguments and T3 identifiers: never a leading dash.
const THREAD_ID = /^[\w:%.][\w:%.-]{0,399}$/;
const REQUEST_ID = /^[\w:.][\w:.-]{0,199}$/;
const ENVIRONMENT_ID = /^\w[\w-]{0,99}$/;
const DELIVERIES = new Set(['started', 'steered', 'queued']);
/** Another process may still be sending this request: do not probe yet. */
export const IN_FLIGHT_GRACE_MS = 60_000;
const JOURNAL_KEEP = 2000;

const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 3_000;
/** Timeline pages (100 items each) searched for an interrupted send. */
const PROBE_PAGES = 5;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Send journal: what makes `clientRequestId` idempotent across sign-ins. T3
 * remembers a request id per MCP sign-in (bearer), so a retry after the
 * bearer changed would send again. Each request is recorded before it is
 * sent (with a fingerprint of the bearer it used) and again with its receipt
 * once it lands. Every decision and every write happens under one lock file
 * and re-reads the journal first, so two processes cannot both claim an id.
 */
export function createSendJournal(file) {
  const lockFile = `${file}.lock`;
  const load = () => {
    const entries = new Map();
    const lines = (readPrivateFile(file) ?? '').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        if (typeof row?.k === 'string')
          entries.set(row.k, { ...entries.get(row.k), ...row });
      } catch {
        // A torn last line from a crash: skip it.
      }
    }
    if (lines.length > JOURNAL_KEEP * 2) {
      const kept = [...entries.values()].slice(-JOURNAL_KEEP);
      entries.clear();
      for (const row of kept) entries.set(row.k, row);
      writePrivateFile(
        file,
        kept.map((row) => `${JSON.stringify(row)}\n`).join('')
      );
    }
    return entries;
  };
  const locked = (run) => {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const deadline = Date.now() + LOCK_WAIT_MS;
    for (;;) {
      try {
        fs.closeSync(
          fs.openSync(
            lockFile,
            fs.constants.O_WRONLY |
              fs.constants.O_CREAT |
              fs.constants.O_EXCL |
              fs.constants.O_NOFOLLOW,
            0o600
          )
        );
        break;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        let stale = false;
        try {
          stale = Date.now() - fs.lstatSync(lockFile).mtimeMs > LOCK_STALE_MS;
        } catch {
          // Released between the two calls: try again.
        }
        if (stale) fs.rmSync(lockFile, { force: true });
        else if (Date.now() > deadline) throw new Error('journal_locked');
        else sleepSync(25);
      }
    }
    try {
      return run(load());
    } finally {
      fs.rmSync(lockFile, { force: true });
    }
  };
  const put = (row) => appendPrivateLine(file, JSON.stringify(row));
  return {
    get: (key) => load().get(key),
    /**
     * Decides, atomically, what the caller may do with `key`:
     * `{ receipt }` (already settled), `{ inFlight }` (another bearer began
     * it less than the grace ago), `{ probe: at }` (it was begun at `at` and
     * never reported back: look in the thread first), or `{ begun }`
     * (recorded for this bearer: send). `takeOver` is the `at` of the begin
     * the caller has probed and found undelivered.
     */
    claim(key, bearerId, at, { takeOver } = {}) {
      return locked((entries) => {
        const known = entries.get(key);
        if (known?.r) return { receipt: known.r };
        if (known && known.at !== takeOver)
          return known.b !== bearerId && at - known.at < IN_FLIGHT_GRACE_MS
            ? { inFlight: true }
            : { probe: known.at };
        put({ k: key, b: bearerId, at });
        return { begun: true };
      });
    },
    begin: (key, bearerId, at) =>
      locked(() => put({ k: key, b: bearerId, at })),
    settle: (key, receipt) => locked(() => put({ k: key, r: receipt })),
  };
}

/**
 * Whether an earlier attempt of this request already reached the thread.
 * T3 derives the message id from the request id, so the thread's own
 * timeline answers it without comparing any text. A steer T3 accepted but
 * has not injected yet is not in the timeline; that one case sends again.
 */
async function findDelivered(call, target, clientRequestId) {
  const suffix = `:thread-send:${clientRequestId}`;
  let beforePosition;
  for (let page = 0; page < PROBE_PAGES; page++) {
    const read = await call('t3_thread_read', {
      ...target,
      limit: 100,
      ...(beforePosition === undefined ? {} : { beforePosition }),
    });
    const hit = (read?.items ?? []).find(
      (item) =>
        typeof item?.messageId === 'string' && item.messageId.endsWith(suffix)
    );
    if (hit) return hit;
    if (!Number.isInteger(read?.earlierPosition)) return undefined;
    beforePosition = read.earlierPosition;
  }
  return undefined;
}

/**
 * Sends `message` to `threadId` with steer semantics through an open MCP
 * session's `call`. With a `clientRequestId` and a `journal`, a retry returns
 * the first receipt instead of sending twice, whichever session sent it.
 */
export async function steerThread(
  call,
  { threadId, message, clientRequestId, environmentId },
  { journal, bearerId, now = Date.now } = {}
) {
  if (!THREAD_ID.test(String(threadId ?? '')))
    throw new T3McpError('steer_thread_invalid');
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text || text.length > STEER_MESSAGE_MAX)
    throw new T3McpError('steer_message_invalid');
  if (clientRequestId !== undefined && !REQUEST_ID.test(clientRequestId))
    throw new T3McpError('steer_request_id_invalid');
  if (environmentId !== undefined && !ENVIRONMENT_ID.test(environmentId))
    throw new T3McpError('steer_environment_invalid');
  const target = { threadId, ...(environmentId ? { environmentId } : {}) };

  const tracked = clientRequestId !== undefined && journal !== undefined;
  const remember = (receipt) => {
    try {
      journal.settle(clientRequestId, receipt);
    } catch {
      // Delivered either way; a retry is then settled by T3 or the timeline.
    }
  };
  if (tracked) {
    let claim;
    try {
      claim = journal.claim(clientRequestId, bearerId, now());
    } catch {
      // Nothing was sent: without the journal a retry could send twice.
      throw new T3McpError('steer_journal_unsafe');
    }
    if (claim.probe !== undefined) {
      // Begun before and never reported back (a timeout, a crash, another
      // bearer): the thread itself says whether it arrived.
      const landed = await findDelivered(call, target, clientRequestId);
      if (landed) {
        // It arrived; how (steered or started) is no longer knowable.
        const receipt = {
          delivery: 'delivered',
          threadId,
          messageId: landed.messageId,
          runId: landed.runId ?? null,
        };
        remember(receipt);
        return receipt;
      }
      try {
        claim = journal.claim(clientRequestId, bearerId, now(), {
          takeOver: claim.probe,
        });
      } catch {
        throw new T3McpError('steer_journal_unsafe');
      }
    }
    if (claim.receipt) return claim.receipt;
    if (!claim.begun) throw new T3McpError('steer_in_flight');
  }

  // `auto` is decided inside T3 in one step: steer the running turn, or start
  // the idle thread. Asking for `steer` first would only add a second call
  // and a window in which the thread could change state between the two.
  const sent = await call('t3_thread_send', {
    ...target,
    message: text,
    mode: 'auto',
    ...(clientRequestId ? { clientRequestId } : {}),
  });
  if (!DELIVERIES.has(sent?.delivery)) throw new T3McpError('t3_rpc_error');
  const finish = (delivery) => {
    const receipt = {
      delivery,
      threadId: sent.threadId ?? threadId,
      messageId: sent.messageId ?? null,
      runId: sent.runId ?? null,
    };
    if (tracked) remember(receipt);
    return receipt;
  };
  if (sent.delivery !== 'queued') return finish(sent.delivery);

  let activeRunId;
  try {
    const read = await call('t3_thread_read', { ...target, limit: 1 });
    activeRunId = read?.thread?.activeRunId ?? read?.activeRunId;
  } catch {
    return finish('queued');
  }
  // Nothing to steer into: the message is first in line and starts next.
  if (typeof activeRunId !== 'string' || activeRunId === sent.runId)
    return finish('queued');
  try {
    await call('t3_queue', {
      ...target,
      action: 'promote_to_steer',
      queuedRunId: sent.runId,
      targetRunId: activeRunId,
    });
    return finish('steered');
  } catch {
    // Promotion is best effort; the message is safe in the queue either way.
    return finish('queued');
  }
}

/** One-shot: sign in if needed, steer, close the session. */
export async function steerOnce(input, options = {}) {
  const paths = options.paths ?? localT3Paths(options.home);
  // Read before anything is sent: an unreadable journal must not cost a send.
  let journal = options.journal;
  if (!journal && input.clientRequestId !== undefined) {
    try {
      journal = createSendJournal(paths.journalFile);
    } catch {
      throw new T3McpError('steer_journal_unsafe');
    }
  }
  const session = await (options.connect ?? connectLocalMcp)({
    ...options,
    paths,
  });
  try {
    return await steerThread(session.call, input, {
      journal,
      bearerId: session.bearerId,
      ...(options.now ? { now: options.now } : {}),
    });
  } finally {
    await session.close();
  }
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') flags.json = true;
    else if (arg === '--request-id' || arg === '--env') flags[arg] = argv[++i];
    // A lone `-` means stdin; any other dash-led word is not an id.
    else if (arg.startsWith('-') && arg !== '-') throw new T3McpError('usage');
    else positional.push(arg);
  }
  return { positional, flags };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (positional.length !== 2) throw new T3McpError('usage');
  const [threadId, raw] = positional;
  const receipt = await steerOnce({
    threadId,
    message: raw === '-' ? await readStdin() : raw,
    ...(flags['--request-id']
      ? { clientRequestId: flags['--request-id'] }
      : {}),
    ...(flags['--env'] ? { environmentId: flags['--env'] } : {}),
  });
  // The delivery and ids only: the message text is never printed.
  console.log(flags.json ? JSON.stringify(receipt) : receipt.delivery);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof T3McpError ? error.code : 'steer_failed');
    process.exitCode = 1;
  });
}

#!/usr/bin/env node
// Mastermind fleet sync publisher. Run once per launchd tick on the
// orchestrator Mac: publishes the live fleet snapshot when it changes (or every
// heartbeat), then pulls owner decision answers into the local answers folder
// and acknowledges them. It never sends messages to fleet threads.
// Runbook: apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync
import { createHmac, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  baseFleetState,
  parseDecisionExtras,
  readRelease,
  readResolved,
} from './decision-extras.mjs';
import {
  buildFleetState,
  contentHash,
  isoTime,
  readFleetRows,
  slugify,
} from './fleet-state.mjs';
import { PEER_DEADLINE_MS, readPeers } from './peer-lanes.mjs';
import { fleetText } from './scrub.mjs';

const HEARTBEAT_MS = 2 * 60 * 1000;
const STATE_PATH = '/api/v1/mastermind/fleet/state';
const ANSWERS_PATH = '/api/v1/mastermind/fleet/answers';
const SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const HTTPS_ORIGIN = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i;
const LOOPBACK_ORIGIN = /^http:\/\/127\.0\.0\.1(:\d+)?$/;
const URGENCY = new Set(['urgent', 'high', 'normal', 'fyi']);
// Contract caps (apps/web/src/lib/mastermind/fleet/contract.ts). Text is
// scrubbed and capped exactly as the route will store it: the Web edge guard
// rejects the whole request (400) for any `title` or `label` over 280
// graphemes or any field with more than ten emoji, and a required field the
// route scrubs to nothing fails the whole snapshot (422).
const DECISION_TITLE_MAX = 120;
const DECISION_BODY_MAX = 600;
const OPTION_LABEL_MAX = 60;
/** Under the route's 256 KiB body cap (413), with room to spare. */
export const BODY_BUDGET_BYTES = 240 * 1024;
const WEB_TIMEOUT_MS = 6_000;
const TICK_BUDGET_MS = 25_000;
const WEB_RESERVE_MS = 12_000;
/** Hard stop for synchronous work the deadlines cannot interrupt. */
const WATCHDOG_MS = 29_000;
/** Asks keep the full v1 budget; login requests ride on top of it. */
const MAX_DECISIONS = 50;
const MAX_LOGINS = 10;
const OPEN_LOGIN = new Set(['waiting', 'approved']);
/**
 * Responses that mean "this body", not "this publisher" (edge guard, size,
 * schema): retry with the v1 core.
 */
const REFUSED_BODY = [' 400', ' 413', ' 422'];
/** The answers route accepts at most this many acknowledgements per call. */
const ACK_BATCH = 100;

export function defaultPaths(home = os.homedir()) {
  const root = path.join(home, '.local/share/fleet-sync');
  return {
    root,
    database: path.join(home, '.t3/userdata/statev2.sqlite'),
    peerSecretsDir: path.join(home, '.t3/userdata/secrets'),
    peerCacheFile: path.join(root, 'peer-cache.json'),
    secretFile: path.join(root, 'publisher-secret'),
    configFile: path.join(root, 'config.json'),
    openDir: path.join(root, 'decisions/open'),
    answersDir: path.join(root, 'decisions/answers'),
    resolvedDir: path.join(root, 'decisions/resolved'),
    releaseFile: path.join(root, 'release.json'),
    stampFile: path.join(root, 'last-publish.json'),
  };
}

export function signRequest(
  secret,
  method,
  pathWithQuery,
  body,
  nowMs = Date.now()
) {
  const timestamp = String(Math.floor(nowMs / 1000));
  const signature = createHmac('sha256', secret)
    .update(
      `${timestamp}.${method.toUpperCase()} ${pathWithQuery}\n${body}`,
      'utf8'
    )
    .digest('hex');
  return { 'x-mm-timestamp': timestamp, 'x-mm-signature': signature };
}

/**
 * Reads a mode-0600 secret file; refuses anything group/world readable. The
 * mode check and the read share one descriptor, so a file swapped in after
 * the check is never read.
 */
export function readSecret(file) {
  const fd = fs.openSync(file, SAFE_OPEN);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('secret_not_a_file');
    if ((stat.mode & 0o077) !== 0) throw new Error('secret_file_permissions');
    const secret = fs.readFileSync(fd, 'utf8').trim();
    if (secret.length < 32) throw new Error('secret_too_short');
    return secret;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Every file input opens without following links and without blocking, then
 * must be a regular file: a FIFO or device planted at an input path cannot
 * stall the run, which no in-process timer could interrupt.
 */
const SAFE_OPEN =
  fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;

export function readRegularText(file) {
  const fd = fs.openSync(file, SAFE_OPEN);
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error('not_a_regular_file');
    return fs.readFileSync(fd, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function optionalIso(value) {
  return typeof value === 'string' ? isoTime(value) : undefined;
}

/** Validates one orchestrator-authored decision file; returns null if unusable. */
export function parseDecision(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object') return null;
  const extras = parseDecisionExtras(raw, now);
  if (!extras) return null;
  const { id, title, body, urgency, options, recommendedOptionId, laneId } =
    raw;
  if (typeof id !== 'string' || !SLUG.test(id)) return null;
  const cleanTitle = fleetText(title, DECISION_TITLE_MAX);
  if (!cleanTitle) return null;
  const createdAt = optionalIso(raw.createdAt);
  if (!createdAt) return null;
  const cleanOptions = Array.isArray(options)
    ? options
        .map((option) => ({
          id: option?.id,
          label: fleetText(option?.label, OPTION_LABEL_MAX),
        }))
        .filter(
          (option) =>
            typeof option.id === 'string' &&
            SLUG.test(option.id) &&
            option.label
        )
        .slice(0, 6)
    : [];
  const cleanBody = fleetText(body, DECISION_BODY_MAX);
  const deadlineAt = optionalIso(raw.deadlineAt);
  return {
    id,
    title: cleanTitle,
    ...(cleanBody ? { body: cleanBody } : {}),
    urgency: URGENCY.has(urgency) ? urgency : 'normal',
    options: cleanOptions,
    ...(cleanOptions.some((option) => option.id === recommendedOptionId)
      ? { recommendedOptionId }
      : {}),
    ...(typeof laneId === 'string' && SLUG.test(laneId) ? { laneId } : {}),
    ...extras,
    createdAt,
    ...(deadlineAt ? { deadlineAt } : {}),
  };
}

export function readDecisions(dir) {
  if (!fs.existsSync(dir)) return { decisions: [], skipped: 0 };
  let skipped = 0;
  const decisions = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue;
    try {
      const decision = parseDecision(
        JSON.parse(readRegularText(path.join(dir, name)))
      );
      if (decision) decisions.push(decision);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  decisions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // Login requests get their own small budget, and only open ones count,
  // so a backlog of sign-ins can never push an ask out of the snapshot.
  const logins = decisions
    .filter((d) => d.kind === 'login' && OPEN_LOGIN.has(d.login.state))
    .slice(-MAX_LOGINS);
  const asks = decisions
    .filter((d) => d.kind !== 'login')
    .slice(0, MAX_DECISIONS);
  return {
    decisions: [...asks, ...logins].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    ),
    skipped,
  };
}

const ACTIVE = new Set(['running', 'waiting', 'queued']);

/**
 * Fits the serialized snapshot under the body budget, giving up the least
 * useful data first: idle and failed lanes (lowest priority first), then
 * decision bodies, then optional lane detail, then active lanes, then the
 * newest decisions. Active lanes
 * go last because the phone counts each machine's active lanes from the list;
 * `counts` always keep every lane.
 */
export function fitToBudget(state, budget = BODY_BUDGET_BYTES) {
  const size = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');
  let fitted = state;
  let bytes = size(fitted);
  // Resolved history and release status go before anything v1 carries.
  for (const key of ['resolved', 'release']) {
    if (bytes <= budget || !(key in fitted)) continue;
    const { [key]: _dropped, ...rest } = fitted;
    fitted = rest;
    bytes = size(fitted);
  }
  // Drops lanes `keep` rejects from the low-priority end until it fits.
  const trimLanes = (keep) => {
    while (bytes > budget) {
      const lanes = fitted.lanes;
      const average = size(lanes) / Math.max(1, lanes.length);
      let drop = Math.max(1, Math.ceil((bytes - budget) / average));
      const kept = [];
      for (let i = lanes.length - 1; i >= 0; i--) {
        if (drop > 0 && !keep(lanes[i])) {
          drop--;
          continue;
        }
        kept.push(lanes[i]);
      }
      if (kept.length === lanes.length) return;
      fitted = { ...fitted, lanes: kept.reverse() };
      bytes = size(fitted);
    }
  };
  if (bytes > budget) trimLanes((lane) => ACTIVE.has(lane.state));
  if (bytes > budget) {
    fitted = {
      ...fitted,
      decisions: fitted.decisions.map(({ body: _body, ...rest }) => rest),
    };
    bytes = size(fitted);
  }
  if (bytes > budget) {
    // Optional lane detail goes before any active lane does.
    fitted = {
      ...fitted,
      lanes: fitted.lanes.map(
        ({
          project: _project,
          provider: _provider,
          model: _model,
          parentId: _parentId,
          startedAt: _startedAt,
          ...lane
        }) => lane
      ),
    };
    bytes = size(fitted);
  }
  if (bytes > budget) trimLanes(() => false);
  while (bytes > budget && fitted.decisions.length > 0) {
    // The newest login request goes first, then the newest ask.
    const decisions = fitted.decisions;
    let drop = decisions.findLastIndex((d) => d.kind === 'login');
    if (drop < 0) drop = decisions.length - 1;
    fitted = {
      ...fitted,
      decisions: decisions.filter((_, index) => index !== drop),
    };
    bytes = size(fitted);
  }
  return {
    state: fitted,
    bytes,
    droppedLanes: state.lanes.length - fitted.lanes.length,
  };
}

/** A regular file's JSON, or {}; never follows links or blocks. */
function readJson(file) {
  try {
    return JSON.parse(readRegularText(file)) ?? {};
  } catch {
    return {};
  }
}

/** Active lanes and status per machine, for the count-only log line. */
export function machineSummary(state, activeTotals) {
  const summary = {};
  for (const machine of state.machines)
    summary[machine.id] = { status: machine.status, active: 0, lanes: 0 };
  for (const lane of state.lanes) {
    const entry = summary[lane.machineId];
    if (!entry) continue;
    entry.lanes += 1;
    if (['running', 'waiting', 'queued'].includes(lane.state))
      entry.active += 1;
  }
  if (activeTotals)
    for (const [id, active] of Object.entries(activeTotals))
      if (summary[id]) summary[id].active = active;
  return summary;
}

/** Older than the watchdog, so a lock left by a killed run is stale. */
const LOCK_STALE_MS = 60_000;

/**
 * One publisher at a time (a manual run overlapping the launchd tick):
 * overlapping publishes could store an older snapshot over a newer one.
 * Returns a release function; throws `publisher_busy` when held. Known
 * bound: two runs taking over the same stale lock at once can both
 * proceed (documented in the Fleet sync runbook).
 */
export function acquirePublishLock(root, nowMs = Date.now()) {
  const file = path.join(root, 'publish.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, 'wx', 0o600);
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return () => fs.rmSync(file, { force: true });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let age = 0;
      try {
        age = nowMs - fs.lstatSync(file).mtimeMs;
      } catch {
        continue;
      }
      if (age < LOCK_STALE_MS) throw new Error('publisher_busy');
      fs.rmSync(file, { force: true });
    }
  }
  throw new Error('publisher_busy');
}

function writePrivateJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(temp, file);
}

/** Writes each pulled answer as `<decisionId>.r<revision>.json` (mode 0600). */
export function storeAnswers(answersDir, answers) {
  const written = [];
  for (const answer of answers) {
    if (!SLUG.test(answer.decisionId) || !Number.isInteger(answer.revision))
      continue;
    writePrivateJson(
      path.join(answersDir, `${answer.decisionId}.r${answer.revision}.json`),
      answer
    );
    written.push({ decisionId: answer.decisionId, revision: answer.revision });
  }
  return written;
}

async function call(
  { fetchImpl, origin, secret, tickEnd },
  method,
  pathWithQuery,
  body = ''
) {
  const remaining = tickEnd - Date.now();
  if (remaining < 500) throw new Error('tick_budget_exhausted');
  const response = await fetchImpl(`${origin}${pathWithQuery}`, {
    method,
    headers: {
      ...signRequest(secret, method, pathWithQuery, body),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(Math.min(WEB_TIMEOUT_MS, remaining)),
  });
  if (!response.ok)
    throw new Error(
      `${method} ${pathWithQuery.split('?')[0]} ${response.status}`
    );
  return response.json();
}

export async function runOnce({
  paths = defaultPaths(),
  origin,
  now = new Date(),
  fetchImpl = fetch,
  peerFetchImpl = fetch,
  openDatabase,
  force = false,
} = {}) {
  // One budget for the whole run, inside the 30 s launchd tick: peers get at
  // most 10 s (+2 s close), leaving the Web calls at least WEB_RESERVE_MS.
  const tickStartedAt = Date.now();
  const tickEnd = tickStartedAt + TICK_BUDGET_MS;
  if (!origin || !(HTTPS_ORIGIN.test(origin) || LOOPBACK_ORIGIN.test(origin)))
    throw new Error('origin_must_be_https');
  const secret = readSecret(paths.secretFile);
  const web = { fetchImpl, origin, secret, tickEnd };
  const config = readJson(paths.configFile);
  const db = openDatabase(paths.database);
  let rows;
  try {
    rows = readFleetRows(db, now);
  } finally {
    db.close();
  }
  const peerResult = await readPeers({
    links: rows.peers,
    secretsDir: paths.peerSecretsDir,
    cache: readJson(paths.peerCacheFile),
    tickStartedAt,
    deadlineMs: Math.max(
      0,
      Math.min(PEER_DEADLINE_MS, tickEnd - Date.now() - WEB_RESERVE_MS)
    ),
    now,
    fetchImpl: peerFetchImpl,
  });
  try {
    writePrivateJson(paths.peerCacheFile, peerResult.cache);
  } catch {
    // The cache only smooths missed probes; publishing goes on without it.
  }
  rows = { ...rows, peers: peerResult.peers };
  const { decisions, skipped } = readDecisions(paths.openDir);
  const label = config.machineLabel || os.hostname().split('.')[0];
  const resolved = readResolved(paths.resolvedDir, now, readRegularText);
  const release = readRelease(paths.releaseFile, readRegularText);
  const built = buildFleetState(rows, {
    now,
    decisions,
    localMachine: { id: slugify(config.machineId || label, 'local'), label },
    ...(config.orchestratorTitlePattern
      ? {
          orchestratorPattern: new RegExp(config.orchestratorTitlePattern, 'i'),
        }
      : {}),
  });
  const { state, droppedLanes } = fitToBudget({
    ...built,
    ...(resolved.length ? { resolved } : {}),
    ...(release ? { release } : {}),
  });

  const hash = contentHash(state);
  const stamp = readJson(paths.stampFile);
  const due =
    force ||
    stamp.hash !== hash ||
    now.getTime() - Date.parse(stamp.at ?? 0) >= HEARTBEAT_MS;
  let degraded = due ? false : stamp.degraded === true;
  if (due) {
    try {
      await call(web, 'PUT', STATE_PATH, JSON.stringify(state));
    } catch (error) {
      // An addition Web refuses (edge guard, size, schema) must not stop
      // lanes and asks: publish the v1 core once more without the additions.
      // The full snapshot is retried at the next heartbeat or change.
      const base = baseFleetState(state);
      const message = String(error?.message);
      if (
        base === state ||
        !REFUSED_BODY.some((code) => message.endsWith(code))
      )
        throw error;
      await call(web, 'PUT', STATE_PATH, JSON.stringify(base));
      degraded = true;
    }
    writePrivateJson(paths.stampFile, {
      hash,
      at: now.toISOString(),
      ...(degraded ? { degraded: true } : {}),
    });
  }

  // Web serves answers to decisions open in the last 48 hours too, so an
  // answer survives this publish dropping its decision.
  const pulled = await call(
    web,
    'GET',
    `${ANSWERS_PATH}?nonce=${randomUUID()}`
  );
  const written = storeAnswers(paths.answersDir, pulled.answers ?? []);
  for (let i = 0; i < written.length; i += ACK_BATCH)
    await call(
      web,
      'POST',
      ANSWERS_PATH,
      JSON.stringify({ acks: written.slice(i, i + ACK_BATCH) })
    );

  return {
    published: due,
    degraded,
    counts: state.counts,
    lanes: state.lanes.length,
    // Before the lane cap and the body budget trim anything.
    machines: machineSummary(built, built.machineActive),
    ...(droppedLanes ? { droppedLanes } : {}),
    decisions: decisions.length,
    skippedDecisions: skipped,
    answers: written.length,
  };
}

async function main() {
  setTimeout(() => {
    console.error(JSON.stringify({ error: 'watchdog_timeout' }));
    process.exit(1);
  }, WATCHDOG_MS).unref();
  const args = process.argv.slice(2);
  const flag = args.indexOf('--origin');
  const origin =
    flag >= 0 ? args[flag + 1] : process.env.MASTERMIND_FLEET_ORIGIN;
  const { DatabaseSync } = await import('node:sqlite');
  const release = acquirePublishLock(defaultPaths().root);
  let result;
  try {
    result = await runOnce({
      origin,
      force: args.includes('--force'),
      openDatabase: (file) => {
        const db = new DatabaseSync(file, { readOnly: true });
        db.exec('PRAGMA query_only = ON');
        return db;
      },
    });
  } finally {
    release();
  }
  // Counts only: no titles, ids or answer text reach the log.
  console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(
      JSON.stringify({ error: String(error?.message ?? error).slice(0, 120) })
    );
    process.exitCode = 1;
  });
}

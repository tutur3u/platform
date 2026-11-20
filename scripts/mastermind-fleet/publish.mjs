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
  buildFleetState,
  contentHash,
  readFleetRows,
  slugify,
} from './fleet-state.mjs';

const HEARTBEAT_MS = 2 * 60 * 1000;
const STATE_PATH = '/api/v1/mastermind/fleet/state';
const ANSWERS_PATH = '/api/v1/mastermind/fleet/answers';
const SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const HTTPS_ORIGIN = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i;
const LOOPBACK_ORIGIN = /^http:\/\/127\.0\.0\.1(:\d+)?$/;
const URGENCY = new Set(['urgent', 'high', 'normal', 'fyi']);

export function defaultPaths(home = os.homedir()) {
  const root = path.join(home, '.local/share/fleet-sync');
  return {
    root,
    database: path.join(home, '.t3/userdata/statev2.sqlite'),
    secretFile: path.join(root, 'publisher-secret'),
    configFile: path.join(root, 'config.json'),
    openDir: path.join(root, 'decisions/open'),
    answersDir: path.join(root, 'decisions/answers'),
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
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if ((stat.mode & 0o077) !== 0) throw new Error('secret_file_permissions');
    const secret = fs.readFileSync(fd, 'utf8').trim();
    if (secret.length < 32) throw new Error('secret_too_short');
    return secret;
  } finally {
    fs.closeSync(fd);
  }
}

function optionalIso(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : undefined;
}

/** Validates one orchestrator-authored decision file; returns null if unusable. */
export function parseDecision(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { id, title, body, urgency, options, recommendedOptionId, laneId } =
    raw;
  if (typeof id !== 'string' || !SLUG.test(id)) return null;
  if (typeof title !== 'string' || !title.trim()) return null;
  const createdAt = optionalIso(raw.createdAt);
  if (!createdAt) return null;
  const cleanOptions = Array.isArray(options)
    ? options
        .filter(
          (option) =>
            option &&
            typeof option.id === 'string' &&
            SLUG.test(option.id) &&
            typeof option.label === 'string' &&
            option.label.trim()
        )
        .slice(0, 6)
        .map((option) => ({ id: option.id, label: option.label.slice(0, 240) }))
    : [];
  const deadlineAt = optionalIso(raw.deadlineAt);
  return {
    id,
    title: title.slice(0, 480),
    ...(typeof body === 'string' && body.trim()
      ? { body: body.slice(0, 2400) }
      : {}),
    urgency: URGENCY.has(urgency) ? urgency : 'normal',
    options: cleanOptions,
    ...(cleanOptions.some((option) => option.id === recommendedOptionId)
      ? { recommendedOptionId }
      : {}),
    ...(typeof laneId === 'string' && SLUG.test(laneId) ? { laneId } : {}),
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
        JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
      );
      if (decision) decisions.push(decision);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  decisions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { decisions: decisions.slice(0, 50), skipped };
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
  fetchImpl,
  origin,
  secret,
  method,
  pathWithQuery,
  body = ''
) {
  const response = await fetchImpl(`${origin}${pathWithQuery}`, {
    method,
    headers: {
      ...signRequest(secret, method, pathWithQuery, body),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
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
  openDatabase,
  force = false,
} = {}) {
  if (!origin || !(HTTPS_ORIGIN.test(origin) || LOOPBACK_ORIGIN.test(origin)))
    throw new Error('origin_must_be_https');
  const secret = readSecret(paths.secretFile);
  const config = fs.existsSync(paths.configFile)
    ? JSON.parse(fs.readFileSync(paths.configFile, 'utf8'))
    : {};
  const db = openDatabase(paths.database);
  let rows;
  try {
    rows = readFleetRows(db, now);
  } finally {
    db.close();
  }
  const { decisions, skipped } = readDecisions(paths.openDir);
  const label = config.machineLabel || os.hostname().split('.')[0];
  const state = buildFleetState(rows, {
    now,
    decisions,
    localMachine: { id: slugify(config.machineId || label, 'local'), label },
    ...(config.orchestratorTitlePattern
      ? {
          orchestratorPattern: new RegExp(config.orchestratorTitlePattern, 'i'),
        }
      : {}),
  });

  const hash = contentHash(state);
  const stamp = fs.existsSync(paths.stampFile)
    ? JSON.parse(fs.readFileSync(paths.stampFile, 'utf8'))
    : {};
  const due =
    force ||
    stamp.hash !== hash ||
    now.getTime() - Date.parse(stamp.at ?? 0) >= HEARTBEAT_MS;
  if (due) {
    await call(
      fetchImpl,
      origin,
      secret,
      'PUT',
      STATE_PATH,
      JSON.stringify(state)
    );
    writePrivateJson(paths.stampFile, { hash, at: now.toISOString() });
  }

  const pulled = await call(
    fetchImpl,
    origin,
    secret,
    'GET',
    `${ANSWERS_PATH}?nonce=${randomUUID()}`
  );
  const written = storeAnswers(paths.answersDir, pulled.answers ?? []);
  if (written.length > 0)
    await call(
      fetchImpl,
      origin,
      secret,
      'POST',
      ANSWERS_PATH,
      JSON.stringify({ acks: written })
    );

  return {
    published: due,
    counts: state.counts,
    lanes: state.lanes.length,
    decisions: decisions.length,
    skippedDecisions: skipped,
    answers: written.length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = args.indexOf('--origin');
  const origin =
    flag >= 0 ? args[flag + 1] : process.env.MASTERMIND_FLEET_ORIGIN;
  const { DatabaseSync } = await import('node:sqlite');
  const result = await runOnce({
    origin,
    force: args.includes('--force'),
    openDatabase: (file) => {
      const db = new DatabaseSync(file, { readOnly: true });
      db.exec('PRAGMA query_only = ON');
      return db;
    },
  });
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

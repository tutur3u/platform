// Resumable, operator-host ledger for the storage re-key job.
//
// The ledger is a mode-600 JSON file. It is the only durable state the job
// owns: no database migration is involved. Object names live here (the
// operator host is trusted) but are never written to logs.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  atomicWriteFileSync,
  writeExclusiveFileSync,
} = require('../safe-fs.js');

export const LEDGER_VERSION = 1;

export const STATES = Object.freeze([
  'selected',
  'copied',
  'verified',
  'refs_updated',
  'old_deleted',
  'skipped',
  'failed',
  'rolled_back',
]);

export const TERMINAL_STATES = new Set([
  'old_deleted',
  'skipped',
  'failed',
  'rolled_back',
]);

// Forward path plus the explicit escape hatches. A `failed` row records the
// state it failed from; it resumes only to that state (`--retry-failed`, under
// a fresh approval) or is rolled back. // operator can inspect them and roll back; they never resume automatically.
const TRANSITIONS = Object.freeze({
  selected: ['copied', 'skipped', 'failed'],
  copied: ['verified', 'skipped', 'failed', 'rolled_back'],
  verified: ['refs_updated', 'skipped', 'failed', 'rolled_back'],
  refs_updated: ['old_deleted', 'failed', 'rolled_back'],
  failed: ['rolled_back', 'selected', 'copied', 'verified', 'refs_updated'],
  old_deleted: [],
  skipped: [],
  rolled_back: [],
});

export class LedgerError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
  }
}

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertPrivateFile(file, fsImpl = fs) {
  if (process.platform === 'win32') return;
  const stat = fsImpl.statSync(file);
  if ((stat.mode & 0o077) !== 0) {
    throw new LedgerError(
      'Ledger file must be mode 600 (no group/other access)',
      'ERR_LEDGER_MODE'
    );
  }
}

export function emptyLedger({ projectRef, environment, bucket, now }) {
  return {
    version: LEDGER_VERSION,
    projectRef,
    environment,
    bucket,
    createdAt: now,
    approvals: {},
    objects: {},
  };
}

export function loadLedger(file, expected, { fsImpl = fs, now } = {}) {
  if (!fsImpl.existsSync(file)) {
    return emptyLedger({ ...expected, now: now ?? new Date().toISOString() });
  }
  assertPrivateFile(file, fsImpl);
  const ledger = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
  if (ledger.version !== LEDGER_VERSION) {
    throw new LedgerError('Unsupported ledger version', 'ERR_LEDGER_VERSION');
  }
  for (const key of ['projectRef', 'environment', 'bucket']) {
    if (expected[key] !== undefined && ledger[key] !== expected[key]) {
      // A ledger is bound to one project; reusing it elsewhere would replay
      // another environment's keys.
      throw new LedgerError(`Ledger ${key} mismatch`, 'ERR_LEDGER_SCOPE');
    }
  }
  return ledger;
}

export function saveLedger(file, ledger, { fsImpl = fs } = {}) {
  atomicWriteFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`, {
    fsImpl,
    mode: 0o600,
  });
}

export function acquireLock(file, { fsImpl = fs, pid = process.pid } = {}) {
  const lockFile = `${file}.lock`;
  try {
    writeExclusiveFileSync(lockFile, `${pid}\n`, { fsImpl, mode: 0o600 });
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new LedgerError(
        'Ledger is locked by another run; remove the .lock file only if that run is gone',
        'ERR_LEDGER_LOCKED'
      );
    }
    throw error;
  }
  return () => fsImpl.rmSync(lockFile, { force: true });
}

/**
 * Adds newly selected rows; never touches rows that already exist and never
 * re-selects a key this ledger created (a second pass must not re-key copies).
 */
export function mergeSelection(ledger, rows, { now }) {
  const created = new Set();
  for (const entry of Object.values(ledger.objects)) {
    if (entry.newId) created.add(`id:${entry.newId}`);
    if (entry.newName) created.add(`name:${entry.newName}`);
  }
  let added = 0;
  for (const row of rows) {
    if (ledger.objects[row.id]) continue;
    if (created.has(`id:${row.id}`) || created.has(`name:${row.name}`))
      continue;
    ledger.objects[row.id] = {
      id: row.id,
      root: row.root,
      wsId: row.wsId,
      oldName: row.name,
      newName: null,
      newId: null,
      owner: row.owner ?? null,
      ownerId: row.ownerId ?? null,
      size: row.size ?? null,
      mimetype: row.mimetype ?? null,
      oldUpdatedAt: row.updatedAt,
      state: row.skipReason ? 'skipped' : 'selected',
      skipReason: row.skipReason ?? null,
      errorCode: null,
      failedFrom: null,
      attempts: 0,
      refs: null,
      probe: null,
      history: [{ state: row.skipReason ? 'skipped' : 'selected', at: now }],
    };
    added += 1;
  }
  return added;
}

export const MAX_OBJECT_ATTEMPTS = 3;

export function transition(entry, to, { now, patch = {} } = {}) {
  const resumesElsewhere =
    entry.state === 'failed' && to !== 'rolled_back' && to !== entry.failedFrom;
  if (!canTransition(entry.state, to) || resumesElsewhere) {
    throw new LedgerError(
      `Illegal ledger transition ${entry.state} -> ${to}`,
      'ERR_LEDGER_TRANSITION'
    );
  }
  Object.assign(entry, patch);
  entry.state = to;
  entry.history.push({ state: to, at: now ?? new Date().toISOString() });
  return entry;
}

export function rowsForRoot(ledger, root) {
  return Object.values(ledger.objects).filter((entry) => entry.root === root);
}

export function pendingForRoot(ledger, root) {
  return rowsForRoot(ledger, root).filter(
    (entry) => !TERMINAL_STATES.has(entry.state)
  );
}

export function countByState(entries) {
  const counts = Object.fromEntries(STATES.map((state) => [state, 0]));
  for (const entry of entries) counts[entry.state] += 1;
  return counts;
}

/** Rows an approval covers: pending work plus failed rows (retry/rollback). */
function approvalScope(ledger, root) {
  return rowsForRoot(ledger, root).filter(
    (entry) => !TERMINAL_STATES.has(entry.state) || entry.state === 'failed'
  );
}

/**
 * Resumes failed rows at the state they failed from, so a transient failure
 * (for example at delete, with refs already on the new key) can finish instead
 * of leaving the old key and its leaked URLs live. Rows that exhausted their
 * attempts stay failed for rollback.
 */
export function requeueFailed(ledger, root, { now } = {}) {
  const result = { requeued: [], exhausted: [] };
  for (const entry of rowsForRoot(ledger, root)) {
    if (entry.state !== 'failed') continue;
    if (!entry.failedFrom || entry.attempts >= MAX_OBJECT_ATTEMPTS) {
      result.exhausted.push(entry.id);
      continue;
    }
    transition(entry, entry.failedFrom, { now, patch: { errorCode: null } });
    result.requeued.push(entry.id);
  }
  return result;
}

/** Digest of the exact object set an approval covers. */
export function planDigest(ledger, root) {
  const ids = approvalScope(ledger, root)
    .map((entry) => `${entry.id}:${entry.state}`)
    .sort();
  return createHash('sha256')
    .update(`${root}\n${ids.join('\n')}`)
    .digest('hex');
}

function sha256(value) {
  return createHash('sha256').update(value).digest();
}

/** Issues a fresh one-time approval token; only its hash is kept. */
export function issueApproval(
  ledger,
  root,
  { now, random = randomBytes } = {}
) {
  // Hex, so the value can never be parsed as a CLI flag.
  const token = random(18).toString('hex');
  ledger.approvals[root] = {
    tokenSha256: sha256(token).toString('hex'),
    planDigest: planDigest(ledger, root),
    issuedAt: now,
    usedAt: null,
  };
  return token;
}

export function consumeApproval(ledger, root, token, { now } = {}) {
  const approval = ledger.approvals[root];
  if (!approval) {
    throw new LedgerError(
      'No approval issued for this root',
      'ERR_APPROVAL_MISSING'
    );
  }
  if (approval.usedAt) {
    throw new LedgerError('Approval token already used', 'ERR_APPROVAL_USED');
  }
  const expected = Buffer.from(approval.tokenSha256, 'hex');
  const actual = sha256(String(token ?? ''));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new LedgerError('Approval token mismatch', 'ERR_APPROVAL_TOKEN');
  }
  if (approval.planDigest !== planDigest(ledger, root)) {
    throw new LedgerError(
      'Pending set changed since approval; re-run the dry run',
      'ERR_APPROVAL_STALE'
    );
  }
  approval.usedAt = now ?? new Date().toISOString();
}

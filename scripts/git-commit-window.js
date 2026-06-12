#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const LOCK_FILE_RELATIVE_PATH =
  'tmp/agent-coordination/git-commit-window.lock.json';
const DEFAULT_TTL_MINUTES = 10;
const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 10;
const DEFAULT_WAIT_POLL_MS = 1000;
const MIN_WAIT_POLL_MS = 100;
const MAX_WAIT_POLL_MS = 60_000;
const DEFAULT_WAIT_TIMEOUT_MINUTES = 60;
const MIN_WAIT_TIMEOUT_MINUTES = 1;
const MAX_WAIT_TIMEOUT_MINUTES = 1440;
const CONFLICT_EXIT_CODE = 2;
const ERROR_EXIT_CODE = 1;

const USAGE = `Usage: bun git-commit-window <command> [options]

Commands:
  claim --owner <owner> --scope <scope> [--path <path> ...] [--ttl-minutes 5-10] [--allow-staged]
      Claim exclusive access to the Git index and commit operation.
  wait --owner <owner> --scope <scope> [--path <path> ...] [--ttl-minutes 5-10] [--allow-staged] [--poll-ms <ms>] [--timeout-minutes <minutes>]
      Sleep until the current commit window is released, then claim it.
  status
      Show the current commit-window lock, if any.
  check --token <token>
      Verify that a token still owns an active commit window.
  release --token <token>
      Release a commit window by token.
  release --force-stale
      Release the lock only when it is already expired.

The lock is advisory and stored at ${LOCK_FILE_RELATIVE_PATH}.`;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
    this.exitCode = ERROR_EXIT_CODE;
  }
}

class CommitWindowConflictError extends Error {
  constructor(message, lock = null) {
    super(message);
    this.name = 'CommitWindowConflictError';
    this.exitCode = CONFLICT_EXIT_CODE;
    this.lock = lock;
  }
}

function createToken() {
  return crypto.randomBytes(16).toString('hex');
}

function getCommitWindowPaths(rootDir = ROOT_DIR) {
  const lockFile = path.join(rootDir, LOCK_FILE_RELATIVE_PATH);

  return {
    lockFile,
    lockFileRelativePath: LOCK_FILE_RELATIVE_PATH,
    coordinationDir: path.dirname(lockFile),
  };
}

function parseRequiredValue(argv, index, optionName) {
  const value = argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new UsageError(`Missing value after ${optionName}.`);
  }

  return value;
}

function parseTtlMinutes(rawValue) {
  const value = rawValue ?? String(DEFAULT_TTL_MINUTES);
  const ttlMinutes = Number.parseInt(String(value), 10);

  if (
    !Number.isInteger(ttlMinutes) ||
    String(ttlMinutes) !== String(value).trim()
  ) {
    throw new UsageError('--ttl-minutes must be an integer.');
  }

  if (ttlMinutes < MIN_TTL_MINUTES || ttlMinutes > MAX_TTL_MINUTES) {
    throw new UsageError(
      `--ttl-minutes must be between ${MIN_TTL_MINUTES} and ${MAX_TTL_MINUTES}.`
    );
  }

  return ttlMinutes;
}

function parseIntegerInRange(rawValue, optionName, min, max) {
  const value = String(rawValue ?? '').trim();
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || String(parsed) !== value) {
    throw new UsageError(`${optionName} must be an integer.`);
  }

  if (parsed < min || parsed > max) {
    throw new UsageError(`${optionName} must be between ${min} and ${max}.`);
  }

  return parsed;
}

function parseWaitPollMs(rawValue) {
  return parseIntegerInRange(
    rawValue,
    '--poll-ms',
    MIN_WAIT_POLL_MS,
    MAX_WAIT_POLL_MS
  );
}

function parseWaitTimeoutMinutes(rawValue) {
  return parseIntegerInRange(
    rawValue,
    '--timeout-minutes',
    MIN_WAIT_TIMEOUT_MINUTES,
    MAX_WAIT_TIMEOUT_MINUTES
  );
}

function parseClaimArgs(argv, { allowWaitOptions = false } = {}) {
  const parsed = {
    allowStaged: false,
    owner: null,
    paths: [],
    pollMs: DEFAULT_WAIT_POLL_MS,
    scope: null,
    timeoutMinutes: DEFAULT_WAIT_TIMEOUT_MINUTES,
    ttlMinutes: DEFAULT_TTL_MINUTES,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--allow-staged') {
      parsed.allowStaged = true;
      continue;
    }

    if (arg === '--owner') {
      parsed.owner = parseRequiredValue(argv, index, '--owner');
      index += 1;
      continue;
    }

    if (arg.startsWith('--owner=')) {
      parsed.owner = arg.slice('--owner='.length);
      continue;
    }

    if (arg === '--scope') {
      parsed.scope = parseRequiredValue(argv, index, '--scope');
      index += 1;
      continue;
    }

    if (arg.startsWith('--scope=')) {
      parsed.scope = arg.slice('--scope='.length);
      continue;
    }

    if (arg === '--path') {
      parsed.paths.push(parseRequiredValue(argv, index, '--path'));
      index += 1;
      continue;
    }

    if (arg.startsWith('--path=')) {
      parsed.paths.push(arg.slice('--path='.length));
      continue;
    }

    if (arg === '--ttl-minutes') {
      parsed.ttlMinutes = parseTtlMinutes(
        parseRequiredValue(argv, index, '--ttl-minutes')
      );
      index += 1;
      continue;
    }

    if (arg.startsWith('--ttl-minutes=')) {
      parsed.ttlMinutes = parseTtlMinutes(arg.slice('--ttl-minutes='.length));
      continue;
    }

    if (allowWaitOptions && arg === '--poll-ms') {
      parsed.pollMs = parseWaitPollMs(
        parseRequiredValue(argv, index, '--poll-ms')
      );
      index += 1;
      continue;
    }

    if (allowWaitOptions && arg.startsWith('--poll-ms=')) {
      parsed.pollMs = parseWaitPollMs(arg.slice('--poll-ms='.length));
      continue;
    }

    if (allowWaitOptions && arg === '--timeout-minutes') {
      parsed.timeoutMinutes = parseWaitTimeoutMinutes(
        parseRequiredValue(argv, index, '--timeout-minutes')
      );
      index += 1;
      continue;
    }

    if (allowWaitOptions && arg.startsWith('--timeout-minutes=')) {
      parsed.timeoutMinutes = parseWaitTimeoutMinutes(
        arg.slice('--timeout-minutes='.length)
      );
      continue;
    }

    throw new UsageError(`Unknown claim option: ${arg}`);
  }

  parsed.owner = normalizeRequiredText(parsed.owner, '--owner');
  parsed.scope = normalizeRequiredText(parsed.scope, '--scope');
  parsed.paths = parsed.paths
    .map((claimPath) => claimPath.trim())
    .filter(Boolean);

  if (!allowWaitOptions) {
    delete parsed.pollMs;
    delete parsed.timeoutMinutes;
  }

  return parsed;
}

function parseTokenArgs(argv, command) {
  let forceStale = false;
  let token = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--force-stale' && command === 'release') {
      forceStale = true;
      continue;
    }

    if (arg === '--token') {
      token = parseRequiredValue(argv, index, '--token');
      index += 1;
      continue;
    }

    if (arg.startsWith('--token=')) {
      token = arg.slice('--token='.length);
      continue;
    }

    throw new UsageError(`Unknown ${command} option: ${arg}`);
  }

  if (forceStale && token) {
    throw new UsageError('Use either --token or --force-stale, not both.');
  }

  if (!forceStale) {
    token = normalizeRequiredText(token, '--token');
  }

  return { forceStale, token };
}

function normalizeRequiredText(value, optionName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new UsageError(`${optionName} is required.`);
  }

  return value.trim();
}

function parseArgs(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;

  if (!command || command === '-h' || command === '--help') {
    return { command: 'help' };
  }

  if (command === 'claim') {
    return {
      command,
      ...parseClaimArgs(rest),
    };
  }

  if (command === 'wait') {
    return {
      command,
      ...parseClaimArgs(rest, { allowWaitOptions: true }),
    };
  }

  if (command === 'status') {
    if (rest.length > 0) {
      throw new UsageError(`status does not accept options: ${rest.join(' ')}`);
    }

    return { command };
  }

  if (command === 'check' || command === 'release') {
    return {
      command,
      ...parseTokenArgs(rest, command),
    };
  }

  throw new UsageError(`Unknown command: ${command}\n\n${USAGE}`);
}

function readLockFile(paths, fsImpl = fs) {
  if (!fsImpl.existsSync(paths.lockFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(paths.lockFile, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    throw new Error(
      `Cannot read ${paths.lockFileRelativePath}: ${error.message}`
    );
  }
}

function isLockExpired(lock, nowMs = Date.now()) {
  const expiresAtMs = Date.parse(lock?.expiresAt ?? '');

  if (!Number.isFinite(expiresAtMs)) {
    return false;
  }

  return expiresAtMs <= nowMs;
}

function removeLockFile(paths, fsImpl = fs) {
  if (fsImpl.existsSync(paths.lockFile)) {
    fsImpl.rmSync(paths.lockFile, { force: true });
  }
}

function formatLockIdentity(lock) {
  const owner = lock?.owner || 'unknown owner';
  const scope = lock?.scope || 'unknown scope';
  const expiresAt = lock?.expiresAt || 'unknown expiry';

  return `${owner} (${scope}), expires at ${expiresAt}`;
}

function assertNoActiveLock(paths, { fsImpl = fs, nowMs = Date.now() } = {}) {
  const existingLock = readLockFile(paths, fsImpl);

  if (!existingLock) {
    return false;
  }

  if (isLockExpired(existingLock, nowMs)) {
    removeLockFile(paths, fsImpl);
    return true;
  }

  throw new CommitWindowConflictError(
    `A git commit window is already claimed by ${formatLockIdentity(
      existingLock
    )}.`,
    existingLock
  );
}

function getStagedFiles({ cwd = ROOT_DIR, execFile = execFileSync } = {}) {
  const output = execFile(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMRD'],
    {
      cwd,
      encoding: 'utf8',
    }
  );

  return output
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
}

function createLockPayload(
  claim,
  {
    cwd = process.cwd(),
    now = () => new Date(),
    pid = process.pid,
    rootDir = ROOT_DIR,
    stagedFiles = [],
    tokenFactory = createToken,
  } = {}
) {
  const createdAt = now();
  const expiresAt = new Date(
    createdAt.getTime() + claim.ttlMinutes * 60 * 1000
  );
  const relativeCwd = path.relative(rootDir, cwd) || '.';

  return {
    version: 1,
    token: tokenFactory(),
    owner: claim.owner,
    scope: claim.scope,
    paths: claim.paths,
    pid,
    cwd: relativeCwd,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttlMinutes: claim.ttlMinutes,
    stagedFilesAtClaim: stagedFiles,
  };
}

function writeLockFileAtomic(lock, paths, fsImpl = fs) {
  fsImpl.mkdirSync(paths.coordinationDir, { recursive: true });

  const fd = fsImpl.openSync(paths.lockFile, 'wx');
  try {
    fsImpl.writeFileSync(fd, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  } finally {
    fsImpl.closeSync(fd);
  }
}

function claimCommitWindow(claim, options = {}) {
  const rootDir = options.rootDir ?? ROOT_DIR;
  const fsImpl = options.fsImpl ?? fs;
  const now = options.now ?? (() => new Date());
  const paths = getCommitWindowPaths(rootDir);
  const nowMs = now().getTime();

  assertNoActiveLock(paths, { fsImpl, nowMs });

  const stagedFiles = getStagedFiles({
    cwd: rootDir,
    execFile: options.execFile ?? execFileSync,
  });

  if (stagedFiles.length > 0 && !claim.allowStaged) {
    throw new UsageError(
      [
        'Refusing to claim the git commit window while files are already staged.',
        'Inspect the staged scope first, then rerun with --allow-staged if it is intentional.',
        `Staged files: ${stagedFiles.join(', ')}`,
      ].join(' ')
    );
  }

  const lock = createLockPayload(claim, {
    cwd: options.cwd,
    now,
    pid: options.pid,
    rootDir,
    stagedFiles,
    tokenFactory: options.tokenFactory,
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeLockFileAtomic(lock, paths, fsImpl);
      return { lock, paths, staleLockRemoved: attempt > 0 };
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }

      assertNoActiveLock(paths, { fsImpl, nowMs });
    }
  }

  throw new CommitWindowConflictError(
    'A git commit window was claimed by another process before this claim completed.'
  );
}

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function waitForCommitWindow(waitClaim, options = {}) {
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? sleepSync;
  const onWait = options.onWait ?? (() => {});
  const timeoutMs = waitClaim.timeoutMinutes * 60 * 1000;
  const startedAtMs = now().getTime();
  let attempts = 0;

  while (true) {
    try {
      const result = claimCommitWindow(waitClaim, {
        ...options,
        now,
      });
      return {
        ...result,
        attempts,
        waited: attempts > 0,
      };
    } catch (error) {
      if (!(error instanceof CommitWindowConflictError)) {
        throw error;
      }

      const currentMs = now().getTime();
      const elapsedMs = Math.max(0, currentMs - startedAtMs);

      if (elapsedMs >= timeoutMs) {
        throw new CommitWindowConflictError(
          `Timed out after ${waitClaim.timeoutMinutes} minute(s) waiting for ${formatLockIdentity(
            error.lock
          )} to release the git commit window.`,
          error.lock
        );
      }

      const sleepForMs = Math.min(waitClaim.pollMs, timeoutMs - elapsedMs);
      onWait({
        attempt: attempts,
        lock: error.lock,
        sleepForMs,
      });
      sleep(sleepForMs);
      attempts += 1;
    }
  }
}

function getCommitWindowStatus(options = {}) {
  const rootDir = options.rootDir ?? ROOT_DIR;
  const fsImpl = options.fsImpl ?? fs;
  const nowMs = (options.now ?? (() => new Date()))().getTime();
  const paths = getCommitWindowPaths(rootDir);
  const lock = readLockFile(paths, fsImpl);

  return {
    expired: lock ? isLockExpired(lock, nowMs) : false,
    lock,
    paths,
  };
}

function checkCommitWindow(token, options = {}) {
  const status = getCommitWindowStatus(options);

  if (!status.lock) {
    throw new UsageError('No git commit window is currently claimed.');
  }

  if (status.expired) {
    throw new UsageError(
      `The git commit window for ${formatLockIdentity(status.lock)} has expired.`
    );
  }

  if (status.lock.token !== token) {
    throw new CommitWindowConflictError(
      `The git commit window is owned by ${formatLockIdentity(status.lock)}.`,
      status.lock
    );
  }

  return status;
}

function releaseCommitWindow(
  { forceStale = false, token = null },
  options = {}
) {
  const status = getCommitWindowStatus(options);
  const fsImpl = options.fsImpl ?? fs;

  if (!status.lock) {
    return { released: false, reason: 'none', status };
  }

  if (forceStale) {
    if (!status.expired) {
      throw new CommitWindowConflictError(
        `Refusing to force-release an active git commit window owned by ${formatLockIdentity(
          status.lock
        )}.`,
        status.lock
      );
    }

    removeLockFile(status.paths, fsImpl);
    return { released: true, reason: 'stale', status };
  }

  if (status.lock.token !== token) {
    throw new CommitWindowConflictError(
      `The git commit window is owned by ${formatLockIdentity(status.lock)}.`,
      status.lock
    );
  }

  removeLockFile(status.paths, fsImpl);
  return { released: true, reason: 'token', status };
}

function writeLine(stdout, message = '') {
  stdout.write(`${message}\n`);
}

function writeLockSummary(stdout, lock, { expired = false } = {}) {
  writeLine(stdout, `  Status: ${expired ? 'expired' : 'active'}`);
  writeLine(stdout, `  Owner: ${lock.owner}`);
  writeLine(stdout, `  Scope: ${lock.scope}`);
  writeLine(stdout, `  Created: ${lock.createdAt}`);
  writeLine(stdout, `  Expires: ${lock.expiresAt}`);
  writeLine(stdout, `  PID: ${lock.pid}`);
  writeLine(stdout, `  CWD: ${lock.cwd}`);
  writeLine(
    stdout,
    `  Paths: ${lock.paths.length > 0 ? lock.paths.join(', ') : 'none declared'}`
  );
  writeLine(
    stdout,
    `  Staged files at claim: ${
      lock.stagedFilesAtClaim.length > 0
        ? lock.stagedFilesAtClaim.join(', ')
        : 'none'
    }`
  );
}

function runCli(argv = process.argv.slice(2), options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  try {
    const parsed = parseArgs(argv);

    if (parsed.command === 'help') {
      writeLine(stdout, USAGE);
      return 0;
    }

    if (parsed.command === 'claim') {
      const { lock, paths } = claimCommitWindow(parsed, options);
      writeLine(stdout, 'Git commit window claimed.');
      writeLine(stdout, `  Lock: ${paths.lockFileRelativePath}`);
      writeLine(stdout, `  Token: ${lock.token}`);
      writeLockSummary(stdout, lock);
      return 0;
    }

    if (parsed.command === 'wait') {
      let wroteWaitMessage = false;
      const { attempts, lock, paths, waited } = waitForCommitWindow(parsed, {
        ...options,
        onWait: ({ lock: activeLock, sleepForMs }) => {
          if (wroteWaitMessage) {
            return;
          }

          wroteWaitMessage = true;
          writeLine(
            stdout,
            `Waiting for git commit window owned by ${formatLockIdentity(
              activeLock
            )}.`
          );
          writeLine(stdout, `  Poll interval: ${sleepForMs} ms`);
          writeLine(stdout, `  Timeout: ${parsed.timeoutMinutes} minute(s)`);
        },
      });
      writeLine(
        stdout,
        waited
          ? 'Git commit window released and claimed.'
          : 'Git commit window claimed.'
      );
      writeLine(stdout, `  Lock: ${paths.lockFileRelativePath}`);
      writeLine(stdout, `  Token: ${lock.token}`);
      writeLine(stdout, `  Wait attempts: ${attempts}`);
      writeLockSummary(stdout, lock);
      return 0;
    }

    if (parsed.command === 'status') {
      const status = getCommitWindowStatus(options);

      if (!status.lock) {
        writeLine(stdout, 'No git commit window is currently claimed.');
        return 0;
      }

      writeLine(
        stdout,
        `Git commit window at ${status.paths.lockFileRelativePath}`
      );
      writeLockSummary(stdout, status.lock, { expired: status.expired });
      return 0;
    }

    if (parsed.command === 'check') {
      const status = checkCommitWindow(parsed.token, options);
      writeLine(stdout, 'Git commit window token is valid.');
      writeLockSummary(stdout, status.lock);
      return 0;
    }

    if (parsed.command === 'release') {
      const result = releaseCommitWindow(parsed, options);

      if (!result.released) {
        writeLine(stdout, 'No git commit window is currently claimed.');
        return 0;
      }

      writeLine(
        stdout,
        result.reason === 'stale'
          ? 'Expired git commit window released.'
          : 'Git commit window released.'
      );
      return 0;
    }

    throw new UsageError(`Unsupported command: ${parsed.command}`);
  } catch (error) {
    writeLine(stderr, error instanceof Error ? error.message : String(error));
    return error.exitCode ?? ERROR_EXIT_CODE;
  }
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  CommitWindowConflictError,
  DEFAULT_TTL_MINUTES,
  DEFAULT_WAIT_POLL_MS,
  DEFAULT_WAIT_TIMEOUT_MINUTES,
  LOCK_FILE_RELATIVE_PATH,
  MAX_TTL_MINUTES,
  MAX_WAIT_POLL_MS,
  MAX_WAIT_TIMEOUT_MINUTES,
  MIN_TTL_MINUTES,
  MIN_WAIT_POLL_MS,
  MIN_WAIT_TIMEOUT_MINUTES,
  UsageError,
  checkCommitWindow,
  claimCommitWindow,
  createLockPayload,
  getCommitWindowPaths,
  getCommitWindowStatus,
  getStagedFiles,
  isLockExpired,
  parseArgs,
  parseTtlMinutes,
  parseWaitPollMs,
  parseWaitTimeoutMinutes,
  releaseCommitWindow,
  runCli,
  waitForCommitWindow,
};

// Machine-side state of Mastermind secret entry: platform and helper
// checks, the machine key, the paired owner keys (behind one lock), the
// owner's operations file, the audit log and the answer spool. Files are
// mode 0600, owned by this user and opened without following links.
// Design: apps/docs/build/devops/mastermind-secret-entry.mdx.
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendPrivateLine,
  readPrivateFile,
  writePrivateFile,
} from './private-files.mjs';
import { fleetText } from './scrub.mjs';
import {
  b64url,
  COMMAND_MAX,
  fromB64url,
  ownerKeyId,
  rawPublicKey,
  SECRET_PROTOCOL_VERSION,
  signerFromSeed,
} from './secret-protocol.mjs';

const SLUG = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
export const MAX_OWNER_KEYS = 4;
export const MAX_TTL_MINUTES = 30;
export const MIN_MACOS_MAJOR = 14;
const PURPOSE_MAX = 120;
const LABEL_MAX = 40;
const ARG_MAX = 512;
const ARGS_MAX = 64;
const LOCK_WAIT_MS = 10_000;
const LOCK_STALE_MS = 30_000;

export function secretPaths(home = os.homedir()) {
  const root = path.join(home, '.local/share/fleet-sync');
  return {
    root,
    binDir: path.join(root, 'bin'),
    helperFile: path.join(root, 'bin/mm-secret-hpke'),
    helperDigestFile: path.join(root, 'bin/mm-secret-hpke.sha256'),
    configFile: path.join(root, 'config.json'),
    machineKeyFile: path.join(root, 'secret-request-key'),
    ownerKeysFile: path.join(root, 'secret-owner-keys.json'),
    ownerKeysLock: path.join(root, 'secret-owner-keys.lock'),
    operationsFile: path.join(root, 'secret-operations.json'),
    openDir: path.join(root, 'decisions/open'),
    answersDir: path.join(root, 'decisions/answers'),
    resolvedDir: path.join(root, 'decisions/resolved'),
    auditFile: path.join(root, 'logs/secret-requests.jsonl'),
  };
}

const own = (stat) =>
  typeof process.getuid !== 'function' || stat.uid === process.getuid();
const protectedEntry = (stat) => own(stat) && (stat.mode & 0o022) === 0;

/**
 * Fails closed unless this is macOS 14 or later and the CryptoKit helper is
 * the pinned, protected binary. No helper code runs before its path,
 * ownership, mode and SHA-256 are checked; only then is `version` asked.
 * Returns the helper path.
 */
export function verifyPlatform(
  paths,
  {
    platform = process.platform,
    productVersion = () =>
      execFileSync('/usr/bin/sw_vers', ['-productVersion'], {
        encoding: 'utf8',
        timeout: 5000,
      }),
    runVersion = (file) =>
      execFileSync(file, ['version'], {
        encoding: 'utf8',
        timeout: 5000,
        env: { PATH: '/usr/bin:/bin' },
      }),
  } = {}
) {
  if (platform !== 'darwin') throw new Error('secret_unsupported_os');
  let major = NaN;
  try {
    major = Number(String(productVersion()).trim().split('.')[0]);
  } catch {
    major = NaN;
  }
  if (!(major >= MIN_MACOS_MAJOR)) throw new Error('secret_unsupported_os');
  try {
    for (const dir of [paths.root, paths.binDir]) {
      const stat = fs.lstatSync(dir);
      if (!stat.isDirectory() || !protectedEntry(stat)) throw new Error();
    }
    for (const file of [paths.helperFile, paths.helperDigestFile]) {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || !protectedEntry(stat)) throw new Error();
    }
  } catch {
    throw new Error('secret_helper_missing');
  }
  const pinned = fs.readFileSync(paths.helperDigestFile, 'utf8').trim();
  const actual = createHash('sha256')
    .update(fs.readFileSync(paths.helperFile))
    .digest('hex');
  if (!/^[0-9a-f]{64}$/.test(pinned) || pinned !== actual)
    throw new Error('secret_helper_mismatch');
  let reported;
  try {
    reported = JSON.parse(runVersion(paths.helperFile)).protocol;
  } catch {
    reported = undefined;
  }
  if (reported !== SECRET_PROTOCOL_VERSION)
    throw new Error('secret_helper_mismatch');
  return paths.helperFile;
}

function readJson(file, privateMode = true) {
  const text = readPrivateFile(file, { privateMode });
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The fleet machine id and display label from the publisher's config. */
export function machineIdentity(paths) {
  const config = readJson(paths.configFile, false) ?? {};
  if (typeof config.machineId !== 'string' || !SLUG.test(config.machineId))
    throw new Error('secret_machine_id');
  const label = fleetText(config.machineLabel, LABEL_MAX);
  return {
    machineId: config.machineId,
    machineLabel:
      label && label === config.machineLabel ? label : config.machineId,
  };
}

/**
 * The machine key (Ed25519). Created once, with an exclusive 0600 file, when
 * `create` is set; any other mode or owner is refused.
 */
export function machineKey(paths, { create = false } = {}) {
  let text = readPrivateFile(paths.machineKeyFile);
  if (text === null && create && !fs.existsSync(paths.machineKeyFile)) {
    fs.mkdirSync(path.dirname(paths.machineKeyFile), {
      recursive: true,
      mode: 0o700,
    });
    const seed = randomBytes(32);
    const fd = fs.openSync(
      paths.machineKeyFile,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600
    );
    try {
      fs.writeFileSync(fd, `${b64url(seed)}\n`);
    } finally {
      fs.closeSync(fd);
      seed.fill(0);
    }
    text = readPrivateFile(paths.machineKeyFile);
  }
  const seed = fromB64url(text?.trim(), 32);
  if (!seed) throw new Error('secret_machine_key');
  try {
    const key = signerFromSeed(seed);
    return { key, publicKey: rawPublicKey(key) };
  } finally {
    seed.fill(0);
  }
}

/**
 * Runs `fn` holding the owner-key lock, an exclusively created directory.
 * Enrolment, revocation and answer claims all take it, so none of them can
 * act on a stale read of the owner keys.
 */
export function withOwnerKeysLock(paths, fn, nowMs = () => Date.now()) {
  const deadline = nowMs() + LOCK_WAIT_MS;
  fs.mkdirSync(path.dirname(paths.ownerKeysLock), {
    recursive: true,
    mode: 0o700,
  });
  for (;;) {
    try {
      fs.mkdirSync(paths.ownerKeysLock, { mode: 0o700 });
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        if (nowMs() - fs.statSync(paths.ownerKeysLock).mtimeMs > LOCK_STALE_MS)
          fs.rmdirSync(paths.ownerKeysLock);
      } catch {
        // Released meanwhile.
      }
      if (nowMs() > deadline) throw new Error('secret_lock_busy');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmdirSync(paths.ownerKeysLock);
  }
}

/** Paired owner keys: `{ id, publicKey (raw), pairedAt }`. */
export function ownerKeys(paths) {
  const value = readJson(paths.ownerKeysFile);
  if (!Array.isArray(value?.keys)) return [];
  return value.keys
    .map((entry) => {
      const publicKey = fromB64url(entry?.publicKey, 32);
      return publicKey && entry.id === ownerKeyId(publicKey)
        ? { id: entry.id, publicKey, pairedAt: String(entry.pairedAt ?? '') }
        : null;
    })
    .filter(Boolean)
    .slice(-MAX_OWNER_KEYS);
}

function writeOwnerKeys(paths, keys) {
  writePrivateFile(
    paths.ownerKeysFile,
    `${JSON.stringify(
      {
        version: 1,
        keys: keys.slice(-MAX_OWNER_KEYS).map((entry) => ({
          id: entry.id,
          publicKey: b64url(entry.publicKey),
          pairedAt: entry.pairedAt,
        })),
      },
      null,
      2
    )}\n`
  );
}

/** Adds an owner key, keeping the newest MAX_OWNER_KEYS. Call under the lock. */
export function addOwnerKey(paths, publicKey, now = new Date()) {
  const id = ownerKeyId(publicKey);
  const keys = ownerKeys(paths).filter((entry) => entry.id !== id);
  keys.push({ id, publicKey, pairedAt: now.toISOString() });
  writeOwnerKeys(paths, keys);
  return id;
}

/** Removes one owner key. Call under the lock. Returns whether it existed. */
export function revokeOwnerKey(paths, id) {
  const keys = ownerKeys(paths);
  const rest = keys.filter((entry) => entry.id !== id);
  if (rest.length === keys.length) return false;
  writeOwnerKeys(paths, rest);
  return true;
}

/** POSIX single quotes for one argument of a remote shell command line. */
export const shellQuote = (arg) => `'${arg.replaceAll("'", "'\\''")}'`;

function argList(value, { absolute = false, min = 1 } = {}) {
  if (
    !Array.isArray(value) ||
    value.length < min ||
    value.length > ARGS_MAX ||
    !value.every(
      (arg) =>
        typeof arg === 'string' && arg.length <= ARG_MAX && !CONTROL.test(arg)
    ) ||
    (absolute && !path.isAbsolute(value[0]))
  )
    throw new Error('secret_operation_argv');
  return value;
}

/**
 * One operation from the owner's operations file, resolved with the agent's
 * extra arguments into the exact local `argv` the helper runs and, for SSH,
 * the `remote` arguments the remote command receives. `command` is the bound
 * JSON text the phone shows.
 */
export function resolveOperation(paths, operationId, extra = []) {
  if (!SLUG.test(operationId ?? '')) throw new Error('secret_operation');
  const file = readJson(paths.operationsFile);
  if (file?.version !== 1 || typeof file.operations !== 'object')
    throw new Error('secret_operations_file');
  const op = Object.hasOwn(file.operations, operationId)
    ? file.operations[operationId]
    : null;
  if (!op || typeof op !== 'object') throw new Error('secret_operation');
  if (extra.length && op.extraArgs !== true)
    throw new Error('secret_operation_args');
  argList(extra, { min: 0 });
  let argv;
  let remote = null;
  if (op.ssh !== undefined) {
    if (op.argv !== undefined) throw new Error('secret_operation_argv');
    const ssh = argList(op.ssh, { absolute: true });
    remote = [...argList(op.remote), ...extra];
    argList(remote);
    argv = [...ssh, '--', remote.map(shellQuote).join(' ')];
  } else {
    argv = [...argList(op.argv, { absolute: true }), ...extra];
  }
  if (argv.length > ARGS_MAX + 2) throw new Error('secret_operation_args');
  const command = JSON.stringify(remote ? { argv, remote } : { argv });
  if (Buffer.byteLength(command, 'utf8') > COMMAND_MAX)
    throw new Error('secret_operation_args');
  const purpose = fleetText(op.purpose, PURPOSE_MAX);
  if (!purpose || purpose !== op.purpose) throw new Error('secret_purpose');
  if (op.delivery !== 'stdin' && op.delivery !== 'fd3')
    throw new Error('secret_operation_delivery');
  if (
    op.output !== undefined &&
    op.output !== 'withheld' &&
    op.output !== 'agent'
  )
    throw new Error('secret_operation_output');
  if (
    op.sshAuthSock !== undefined &&
    (typeof op.sshAuthSock !== 'string' ||
      !path.isAbsolute(op.sshAuthSock) ||
      op.sshAuthSock.length > ARG_MAX ||
      CONTROL.test(op.sshAuthSock))
  )
    throw new Error('secret_operation_ssh_agent');
  return {
    id: operationId,
    purpose,
    argv,
    remote,
    command,
    delivery: op.delivery,
    newline: op.newline === true,
    output: op.output ?? 'withheld',
    sshAuthSock: op.sshAuthSock ?? null,
    maxTtlMinutes: Number.isInteger(op.maxTtlMinutes)
      ? Math.min(Math.max(op.maxTtlMinutes, 1), MAX_TTL_MINUTES)
      : 10,
  };
}

/** Appends one audit line: time, request id and outcome only. */
export function audit(paths, requestId, outcome, now = new Date()) {
  try {
    appendPrivateLine(
      paths.auditFile,
      JSON.stringify({ at: now.toISOString(), requestId, outcome })
    );
  } catch {
    // The audit never blocks delivery or cleanup.
  }
}

function list(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/** Spool files for one request id, oldest revision first. */
export function spoolFiles(paths, requestId) {
  const pattern = new RegExp(`^${requestId}\\.r(\\d+)\\.json$`);
  return list(paths.answersDir)
    .map((name) => [name, pattern.exec(name)?.[1]])
    .filter(([, rev]) => rev !== undefined)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map(([name]) => path.join(paths.answersDir, name));
}

/** Reads one spool file as JSON, or null. */
export const readSpool = (file) => readJson(file);

export const removeFiles = (files) => {
  for (const file of files) fs.rmSync(file, { force: true });
};

const OPEN_FILE = /^(secret|pair)-[0-9a-f]{24}\.json$/;

/** Open secret requests and pairings this machine has published. */
export const openSecretFiles = (paths) =>
  list(paths.openDir).filter((name) => OPEN_FILE.test(name));

/**
 * Removes open secret and pairing decisions whose `expiresAt` has passed,
 * left by a helper that died. Their keys died with it.
 */
export function removeExpiredOpen(paths, nowMs = Date.now()) {
  let removed = 0;
  for (const name of openSecretFiles(paths)) {
    const file = path.join(paths.openDir, name);
    const decision = readJson(file);
    const expiresAt = Date.parse(decision?.secret?.expiresAt ?? '');
    if (Number.isNaN(expiresAt) || expiresAt <= nowMs) {
      fs.rmSync(file, { force: true });
      removed++;
    }
  }
  return removed;
}

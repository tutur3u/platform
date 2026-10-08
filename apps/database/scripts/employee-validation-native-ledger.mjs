import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson } from './employee-validation-supervisor.mjs';

const nativeLedgerFailures = new WeakMap();
const ledgerIdentity = /^[a-zA-Z0-9-]{8,128}$/u;
const ledgerHash = /^[a-f0-9]{64}$/u;
export const MAX_NATIVE_LEDGER_RECORD_BYTES = 1024 * 1024;

export function getNativeLedgerFailure(error) {
  return error !== null &&
    (typeof error === 'object' || typeof error === 'function')
    ? (nativeLedgerFailures.get(error) ?? null)
    : null;
}

function ledgerJson(value, depth = 0, budget = { nodes: 0, characters: 0 }) {
  assert(++budget.nodes <= 65536, 'Ledger JSON nodes');
  if (typeof value === 'string') {
    budget.characters += value.length;
    assert(
      budget.characters <= MAX_NATIVE_LEDGER_RECORD_BYTES,
      'Ledger bounded strings'
    );
  }
  assert(depth <= 64, 'Ledger JSON depth');
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return;
  if (typeof value === 'number') {
    assert(Number.isFinite(value), 'Ledger finite number');
    return;
  }
  assert(value && typeof value === 'object', 'Ledger JSON value');
  assert(
    Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype,
    'Ledger JSON object'
  );
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    assert(
      Object.keys(descriptors).length === value.length + 1 &&
        Object.keys(descriptors).every(
          (key) =>
            key === 'length' ||
            (/^(0|[1-9][0-9]*)$/u.test(key) && Number(key) < value.length)
        ),
      'Ledger dense array'
    );
  }
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (Array.isArray(value) && key === 'length') continue;
    assert(
      Object.hasOwn(descriptor, 'value') && descriptor.enumerable,
      'Ledger data property'
    );
    budget.characters += key.length;
    assert(
      budget.characters <= MAX_NATIVE_LEDGER_RECORD_BYTES,
      'Ledger bounded keys'
    );
    ledgerJson(descriptor.value, depth + 1, budget);
  }
}

/** Caller already owns and excludes replacement of every stable directory parent.
 * A frozen JS binding is not native ownership or hostile parent-race proof.
 * No lease, ancestor, generation, recovery authority or native backend is created.
 */
export async function persistNativeLedgerRecord({
  capability,
  lease,
  bytes,
  expectedHash,
  io = { open, lstat },
  onSecondary = () => {},
}) {
  let phase = 'input',
    primary,
    failed = false,
    file,
    directory,
    created = false;
  let creationAttempted = false,
    creationRefused = false;
  const secondary = [];
  const fact = (error, stage) => {
    const code =
      error && (typeof error === 'object' || typeof error === 'function')
        ? Object.getOwnPropertyDescriptor(error, 'code')?.value
        : null;
    return Object.freeze({
      phase: stage,
      code:
        typeof code === 'string' && /^[A-Z0-9_]{1,48}$/u.test(code)
          ? code
          : 'io-failure',
    });
  };
  const note = (error, stage) => {
    if (secondary.length >= 8) return;
    let detail;
    try {
      detail = fact(error, stage);
    } catch {
      detail = Object.freeze({ phase: stage, code: 'io-failure' });
    }
    secondary.push(detail);
    try {
      onSecondary(detail);
    } catch {
      if (secondary.length < 8)
        secondary.push(
          Object.freeze({ phase: 'diagnostic', code: 'callback-failed' })
        );
    }
  };
  const failure = (error, stage) => {
    if (!failed) {
      failed = true;
      primary = error;
      phase = stage;
    } else note(error, stage);
  };
  const close = async (handle, stage) => {
    if (!handle) return;
    try {
      await handle.close();
    } catch (error) {
      failure(error, stage);
    }
  };
  let record, recordHash;
  try {
    assert(
      Buffer.isBuffer(bytes) &&
        bytes.length > 0 &&
        bytes.length <= MAX_NATIVE_LEDGER_RECORD_BYTES,
      'Ledger bounded bytes'
    );
    assert(
      typeof expectedHash === 'string' && ledgerHash.test(expectedHash),
      'Ledger hash'
    );
    const contents = Buffer.from(bytes);
    recordHash = createHash('sha256').update(contents).digest('hex');
    assert.equal(recordHash, expectedHash, 'Ledger byte hash');
    record = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(contents)
    );
    ledgerJson(record);
    assert.equal(
      canonicalJson(record),
      contents.toString('utf8'),
      'Ledger canonical bytes'
    );
    assert.deepEqual(
      Object.keys(record).sort(),
      ['binding', 'hardDeadlineMs', 'kind', 'payload', 'sequence'],
      'Ledger record keys'
    );
    assert(
      typeof record.kind === 'string' &&
        record.kind.length > 0 &&
        record.kind.length <= 128,
      'Ledger kind'
    );
    assert(
      Number.isSafeInteger(record.sequence) && record.sequence > 0,
      'Ledger sequence'
    );
    ledgerJson(lease);
    ledgerJson(capability);
    assert(
      Object.isFrozen(lease) && Object.isFrozen(capability),
      'Ledger immutable capability'
    );
    assert.deepEqual(
      Object.keys(capability).sort(),
      ['binding', 'directory', 'generation', 'leaseId', 'recoveryId'],
      'Ledger capability keys'
    );
    for (const key of ['leaseId', 'recoveryId']) {
      assert(
        typeof lease[key] === 'string' && ledgerIdentity.test(lease[key]),
        'Ledger identity'
      );
      assert.equal(capability[key], lease[key], 'Ledger foreign capability');
    }
    assert(
      Number.isSafeInteger(lease.generation) && lease.generation > 0,
      'Ledger generation'
    );
    assert.equal(
      capability.generation,
      lease.generation,
      'Ledger foreign generation'
    );
    assert(
      Number.isFinite(lease.hardDeadlineMs) && lease.hardDeadlineMs > 0,
      'Ledger deadline'
    );
    assert.equal(
      record.hardDeadlineMs,
      lease.hardDeadlineMs,
      'Ledger deadline binding'
    );
    assert(
      record.binding &&
        Object.getPrototypeOf(record.binding) === Object.prototype,
      'Ledger object binding'
    );
    assert.equal(
      canonicalJson(record.binding),
      canonicalJson(lease.binding),
      'Ledger record binding'
    );
    assert.equal(
      canonicalJson(capability.binding),
      canonicalJson(lease.binding),
      'Ledger capability binding'
    );
    const root = capability.directory;
    assert(
      typeof root === 'string' &&
        path.isAbsolute(root) &&
        path.resolve(root) === root &&
        root !== path.parse(root).root,
      'Ledger directory'
    );
    phase = 'directory-check';
    let cursor = path.parse(root).root;
    for (const part of root.slice(cursor.length).split(path.sep)) {
      cursor = path.join(cursor, part);
      const stat = await io.lstat(cursor);
      assert(
        stat.isDirectory() && !stat.isSymbolicLink(),
        'Ledger directory boundary'
      );
    }
    const parent = await io.lstat(root);
    assert(
      (parent.mode & 0o077) === 0 && parent.uid === process.getuid(),
      'Ledger private directory'
    );
    phase = 'directory-open';
    directory = await io.open(
      root,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW
    );
    const openedParent = await directory.stat();
    assert(
      openedParent.isDirectory() &&
        openedParent.dev === parent.dev &&
        openedParent.ino === parent.ino,
      'Ledger directory identity'
    );
    phase = 'file-open';
    const target = path.join(
      root,
      `record-${lease.generation}-${record.sequence}.json`
    );
    creationAttempted = true;
    file = await io.open(
      target,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_NOFOLLOW,
      0o600
    );
    created = true;
    phase = 'file-check';
    const opened = await file.stat();
    const named = await io.lstat(target);
    assert(
      opened.isFile() &&
        named.isFile() &&
        !named.isSymbolicLink() &&
        opened.nlink === 1 &&
        opened.dev === named.dev &&
        opened.ino === named.ino &&
        (opened.mode & 0o777) === 0o600 &&
        opened.uid === process.getuid(),
      'Ledger file identity'
    );
    phase = 'write';
    for (let offset = 0; offset < contents.length; ) {
      const { bytesWritten } = await file.write(
        contents,
        offset,
        contents.length - offset,
        null
      );
      assert(
        Number.isSafeInteger(bytesWritten) &&
          bytesWritten > 0 &&
          bytesWritten <= contents.length - offset,
        'Ledger incomplete write'
      );
      offset += bytesWritten;
    }
    phase = 'file-sync';
    await file.sync();
  } catch (error) {
    // Only a rejected exclusive open reporting EEXIST refuses THIS creation.
    // It proves no existing entry's ownership, contents or durability.
    if (phase === 'file-open' && creationAttempted && !created) {
      try {
        creationRefused =
          Object.getOwnPropertyDescriptor(error, 'code')?.value === 'EEXIST';
      } catch {}
    }
    failure(error, phase);
  }
  await close(file, 'file-close');
  if (!failed && directory) {
    try {
      await directory.sync();
    } catch (error) {
      failure(error, 'directory-sync');
    }
  }
  await close(directory, 'directory-close');
  if (failed) {
    if (
      primary !== null &&
      (typeof primary === 'object' || typeof primary === 'function')
    ) {
      nativeLedgerFailures.set(
        primary,
        Object.freeze({
          phase,
          creationAttempted,
          creationAcknowledged: created,
          creationOutcome: created
            ? 'acknowledged'
            : !creationAttempted
              ? 'not-attempted'
              : creationRefused
                ? 'exclusive-refusal'
                : 'unknown',
          uncertainRecord: created || (creationAttempted && !creationRefused),
          secondary: Object.freeze([...secondary]),
        })
      );
    }
    throw primary;
  }
  return {
    leaseId: lease.leaseId,
    generation: lease.generation,
    recoveryId: lease.recoveryId,
    sequence: record.sequence,
    recordSha256: recordHash,
    durable: true,
  };
}

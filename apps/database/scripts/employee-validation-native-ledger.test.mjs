import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  getNativeLedgerFailure,
  MAX_NATIVE_LEDGER_RECORD_BYTES,
  persistNativeLedgerRecord,
} from './employee-validation-resources.mjs';
import { canonicalJson } from './employee-validation-supervisor.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  // Test-owned stable private directory only; never a native admission/capability proof.
  const directory = await mkdtemp(
    path.join(await realpath(tmpdir()), 'employee-ledger-test-')
  );
  await chmod(directory, 0o700);
  const binding = Object.freeze({ source: 'synthetic-ledger-record' });
  const lease = Object.freeze({
    leaseId: 'synthetic-lease',
    generation: 1,
    recoveryId: 'synthetic-recovery',
    binding,
    hardDeadlineMs: 900000,
  });
  const capability = Object.freeze({
    directory,
    leaseId: lease.leaseId,
    generation: lease.generation,
    recoveryId: lease.recoveryId,
    binding,
  });
  const record = {
    kind: 'command-intent',
    payload: { synthetic: true },
    sequence: 1,
    binding,
    hardDeadlineMs: lease.hardDeadlineMs,
  };
  const bytes = Buffer.from(canonicalJson(record));
  return {
    directory,
    lease,
    capability,
    record,
    bytes,
    expectedHash: digest(bytes),
    target: path.join(directory, 'record-1-1.json'),
    async dispose() {
      await rm(directory, { recursive: true });
    },
  };
}
async function withFixture(run) {
  const f = await fixture();
  try {
    return await run(f);
  } finally {
    await f.dispose();
  }
}
const options = (f, extra = {}) => ({
  capability: f.capability,
  lease: f.lease,
  bytes: f.bytes,
  expectedHash: f.expectedHash,
  ...extra,
});
async function rejected(operation) {
  let error;
  try {
    await operation();
  } catch (caught) {
    error = caught;
  }
  assert(error, 'operation must return no ACK');
  return error;
}
function faultIO(f, faults = {}, events = []) {
  return {
    lstat,
    async open(target, flags, mode) {
      const type = target === f.directory ? 'directory' : 'file';
      events.push(`${type}-open`);
      if (faults[`${type}-open`]) throw faults[`${type}-open`];
      const handle = await open(target, flags, mode);
      return {
        stat: () => handle.stat(),
        async write(buffer, offset, length, position) {
          events.push('write');
          if (faults.write) throw faults.write;
          if (faults.zeroWrite) return { bytesWritten: 0 };
          if (faults.excessWrite) return { bytesWritten: length + 1 };
          return handle.write(
            buffer,
            offset,
            faults.shortWrite ? Math.min(7, length) : length,
            position
          );
        },
        async sync() {
          events.push(`${type}-sync`);
          if (faults[`${type}-sync`]) throw faults[`${type}-sync`];
          return handle.sync();
        },
        async close() {
          events.push(`${type}-close`);
          await handle.close();
          if (faults[`${type}-close`]) throw faults[`${type}-close`];
        },
      };
    },
  };
}

await test('writes actual canonical bytes and ACK only after both sync/close pairs', () =>
  withFixture(async (f) => {
    const events = [];
    const ack = await persistNativeLedgerRecord(
      options(f, { io: faultIO(f, {}, events) })
    );
    assert.deepEqual(await readFile(f.target), f.bytes);
    assert.equal((await lstat(f.target)).mode & 0o777, 0o600);
    assert.deepEqual(ack, {
      leaseId: f.lease.leaseId,
      generation: 1,
      recoveryId: f.lease.recoveryId,
      sequence: 1,
      recordSha256: f.expectedHash,
      durable: true,
    });
    assert.deepEqual(events.slice(-4), [
      'file-sync',
      'file-close',
      'directory-sync',
      'directory-close',
    ]);
  }));

for (const [name, contents] of [
  ['identical', null],
  ['different', Buffer.from('retained-unknown-record')],
]) {
  await test(`immutable ${name} collision is never adopted or overwritten`, () =>
    withFixture(async (f) => {
      await writeFile(f.target, contents ?? f.bytes);
      const original = await readFile(f.target);
      const error = await rejected(() => persistNativeLedgerRecord(options(f)));
      assert.equal(error.code, 'EEXIST');
      assert.deepEqual(await readFile(f.target), original);
      const failure = getNativeLedgerFailure(error);
      assert.equal(failure.creationAttempted, true);
      assert.equal(failure.creationAcknowledged, false);
      assert.equal(failure.creationOutcome, 'exclusive-refusal');
      assert.equal(failure.uncertainRecord, false);
    }));
}
for (const kind of ['symlink', 'directory']) {
  await test(`${kind} record entry is refused without following it`, () =>
    withFixture(async (f) => {
      const retained = path.join(f.directory, 'retained');
      await writeFile(retained, 'unmodified');
      if (kind === 'symlink') await symlink(retained, f.target);
      else await mkdir(f.target);
      await rejected(() => persistNativeLedgerRecord(options(f)));
      assert.equal(await readFile(retained, 'utf8'), 'unmodified');
      assert.equal(
        (await lstat(f.target))[
          kind === 'symlink' ? 'isSymbolicLink' : 'isDirectory'
        ](),
        true
      );
    }));
}

const invalid = [
  ['zero sequence', (f) => ({ record: { ...f.record, sequence: 0 } })],
  [
    'unsafe sequence',
    (f) => ({ record: { ...f.record, sequence: Number.MAX_SAFE_INTEGER + 1 } }),
  ],
  [
    'foreign record binding',
    (f) => ({ record: { ...f.record, binding: { source: 'foreign' } } }),
  ],
  ['null binding', (f) => ({ record: { ...f.record, binding: null } })],
  [
    'sparse lease binding',
    (f) => ({
      lease: Object.freeze({ ...f.lease, binding: { items: new Array(2) } }),
    }),
  ],
  ['wrong deadline', (f) => ({ record: { ...f.record, hardDeadlineMs: 1 } })],
  ['extra record key', (f) => ({ record: { ...f.record, extra: true } })],
  ['empty kind', (f) => ({ record: { ...f.record, kind: '' } })],
  [
    'foreign capability ID',
    (f) => ({
      capability: Object.freeze({ ...f.capability, leaseId: 'foreign-lease' }),
    }),
  ],
  [
    'foreign recovery',
    (f) => ({
      capability: Object.freeze({
        ...f.capability,
        recoveryId: 'foreign-recovery',
      }),
    }),
  ],
  [
    'foreign generation',
    (f) => ({ capability: Object.freeze({ ...f.capability, generation: 2 }) }),
  ],
  [
    'foreign capability binding',
    (f) => ({
      capability: Object.freeze({
        ...f.capability,
        binding: { source: 'foreign' },
      }),
    }),
  ],
  ['mutable capability', (f) => ({ capability: { ...f.capability } })],
  [
    'unsafe namespace',
    (f) => ({
      capability: Object.freeze({
        ...f.capability,
        directory: `${f.directory}/../outside`,
      }),
    }),
  ],
  [
    'identity separator',
    (f) => ({ lease: Object.freeze({ ...f.lease, leaseId: 'unsafe/id' }) }),
  ],
  [
    'unsafe generation',
    (f) => ({
      lease: Object.freeze({
        ...f.lease,
        generation: Number.MAX_SAFE_INTEGER + 1,
      }),
    }),
  ],
  [
    'nonfinite lease binding',
    (f) => ({
      lease: Object.freeze({ ...f.lease, binding: { number: Infinity } }),
    }),
  ],
  ['wrong hash', () => ({ expectedHash: '0'.repeat(64) })],
  ['nonbuffer', () => ({ bytes: 'text' })],
  [
    'oversize',
    () => ({ bytes: Buffer.alloc(MAX_NATIVE_LEDGER_RECORD_BYTES + 1) }),
  ],
  ['noncanonical', (f) => ({ bytes: Buffer.from(JSON.stringify(f.record)) })],
  ['invalid UTF8', () => ({ bytes: Buffer.from([0xff]) })],
  [
    'duplicate keys',
    () => ({ bytes: Buffer.from('{"sequence":1,"sequence":2}\n') }),
  ],
];
for (const [name, alter] of invalid) {
  await test(`invalid ${name} fails before filesystem effects`, () =>
    withFixture(async (f) => {
      let effects = 0;
      const change = alter(f);
      if (change.record) {
        change.bytes = Buffer.from(canonicalJson(change.record));
        delete change.record;
      }
      if (Buffer.isBuffer(change.bytes))
        change.expectedHash = digest(change.bytes);
      const io = {
        async open() {
          effects++;
          throw new Error('unexpected effect');
        },
        async lstat() {
          effects++;
          throw new Error('unexpected effect');
        },
      };
      await rejected(() =>
        persistNativeLedgerRecord(options(f, { ...change, io }))
      );
      assert.equal(effects, 0);
    }));
}
await test('accessor input is rejected without invoking it', () =>
  withFixture(async (f) => {
    let invoked = 0;
    const binding = Object.defineProperty({}, 'source', {
      enumerable: true,
      get() {
        invoked++;
        throw new Error('not evaluated');
      },
    });
    await rejected(() =>
      persistNativeLedgerRecord(
        options(f, {
          lease: Object.freeze({ ...f.lease, binding }),
          io: {
            open() {
              throw new Error('not reached');
            },
          },
        })
      )
    );
    assert.equal(invoked, 0);
  }));
await test('symlink generation directory is rejected before a record open', () =>
  withFixture(async (f) => {
    const alias = `${f.directory}-alias`;
    await symlink(f.directory, alias);
    try {
      await rejected(() =>
        persistNativeLedgerRecord(
          options(f, {
            capability: Object.freeze({ ...f.capability, directory: alias }),
          })
        )
      );
      await assert.rejects(readFile(f.target), { code: 'ENOENT' });
    } finally {
      await rm(alias);
    }
  }));
await test('nonprivate generation directory is rejected without creating a record', () =>
  withFixture(async (f) => {
    await chmod(f.directory, 0o755);
    await rejected(() => persistNativeLedgerRecord(options(f)));
    await assert.rejects(readFile(f.target), { code: 'ENOENT' });
  }));
await test('partial writes are completed before ACK', () =>
  withFixture(async (f) => {
    const events = [];
    await persistNativeLedgerRecord(
      options(f, { io: faultIO(f, { shortWrite: true }, events) })
    );
    assert(events.filter((x) => x === 'write').length > 1);
    assert.deepEqual(await readFile(f.target), f.bytes);
  }));
for (const kind of ['zeroWrite', 'excessWrite']) {
  await test(`${kind} returns no ACK and retains the created uncertain record`, () =>
    withFixture(async (f) => {
      const error = await rejected(() =>
        persistNativeLedgerRecord(
          options(f, { io: faultIO(f, { [kind]: true }) })
        )
      );
      assert.equal(getNativeLedgerFailure(error).uncertainRecord, true);
      assert.equal((await lstat(f.target)).isFile(), true);
    }));
}
for (const stage of [
  'directory-open',
  'file-open',
  'write',
  'file-sync',
  'file-close',
  'directory-sync',
  'directory-close',
]) {
  await test(`${stage} failure preserves the exact primary and returns no ACK`, () =>
    withFixture(async (f) => {
      const primary = new Error('synthetic primary');
      const events = [];
      const error = await rejected(() =>
        persistNativeLedgerRecord(
          options(f, { io: faultIO(f, { [stage]: primary }, events) })
        )
      );
      assert.equal(error, primary);
      assert.equal(getNativeLedgerFailure(error).phase, stage);
      if (stage === 'file-open') {
        const failure = getNativeLedgerFailure(error);
        assert.equal(failure.creationAttempted, true);
        assert.equal(failure.creationAcknowledged, false);
        assert.equal(failure.creationOutcome, 'unknown');
        assert.equal(failure.uncertainRecord, true);
      }
      if (stage !== 'directory-open' && stage !== 'file-open') {
        assert.equal(getNativeLedgerFailure(error).uncertainRecord, true);
        assert.equal(getNativeLedgerFailure(error).creationAcknowledged, true);
        assert.equal(
          getNativeLedgerFailure(error).creationOutcome,
          'acknowledged'
        );
        assert.equal((await lstat(f.target)).isFile(), true);
      }
      if (stage === 'file-close') assert(!events.includes('directory-sync'));
    }));
}
await test('primary identity survives both close errors and diagnostic callback errors', () =>
  withFixture(async (f) => {
    const primary = new Error('synthetic write failure');
    const error = await rejected(() =>
      persistNativeLedgerRecord(
        options(f, {
          io: faultIO(f, {
            write: primary,
            'file-close': new Error('file'),
            'directory-close': new Error('directory'),
          }),
          onSecondary() {
            throw new Error('diagnostic');
          },
        })
      )
    );
    assert.equal(error, primary);
    const metadata = getNativeLedgerFailure(error);
    assert.equal(metadata.phase, 'write');
    assert.deepEqual(
      metadata.secondary.map((x) => x.phase),
      ['file-close', 'diagnostic', 'directory-close', 'diagnostic']
    );
    assert(
      metadata.secondary.every(
        (x) => Object.keys(x).sort().join(',') === 'code,phase'
      )
    );
    assert.equal((await lstat(f.target)).isFile(), true);
  }));
await test('concurrent same sequence has exactly one writer and no adoption', () =>
  withFixture(async (f) => {
    const results = await Promise.allSettled([
      persistNativeLedgerRecord(options(f)),
      persistNativeLedgerRecord(options(f)),
    ]);
    assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal(results.filter((x) => x.status === 'rejected').length, 1);
    assert.deepEqual(await readFile(f.target), f.bytes);
  }));
await test('distinct sequence names preserve both records', () =>
  withFixture(async (f) => {
    await persistNativeLedgerRecord(options(f));
    const bytes = Buffer.from(canonicalJson({ ...f.record, sequence: 2 }));
    await persistNativeLedgerRecord(
      options(f, { bytes, expectedHash: digest(bytes) })
    );
    assert.deepEqual(await readFile(f.target), f.bytes);
    assert.deepEqual(
      await readFile(path.join(f.directory, 'record-1-2.json')),
      bytes
    );
  }));
await test('distinct preestablished generations have independent namespaces', () =>
  withFixture(async (f) => {
    const directory = path.join(f.directory, 'generation2');
    await mkdir(directory, { mode: 0o700 });
    const lease = Object.freeze({ ...f.lease, generation: 2 });
    const capability = Object.freeze({
      ...f.capability,
      directory,
      generation: 2,
    });
    await persistNativeLedgerRecord(options(f));
    await persistNativeLedgerRecord(options(f, { lease, capability }));
    assert.deepEqual(
      await readFile(path.join(directory, 'record-2-1.json')),
      f.bytes
    );
    assert.deepEqual(await readFile(f.target), f.bytes);
  }));

await test('exclusive create then rejected handle preserves uncertain creation and owned directory closure', () =>
  withFixture(async (f) => {
    const primary = new Error('synthetic lost open acknowledgement');
    const events = [];
    const base = faultIO(f, {}, events);
    let adapterClosed = 0;
    const io = {
      lstat,
      async open(target, flags, mode) {
        if (target === f.directory) return base.open(target, flags, mode);
        const adapterOwned = await open(target, flags, mode);
        await adapterOwned.close();
        adapterClosed++;
        throw primary;
      },
    };
    const error = await rejected(() =>
      persistNativeLedgerRecord(options(f, { io }))
    );
    assert.equal(error, primary);
    const failure = getNativeLedgerFailure(error);
    assert.equal(failure.phase, 'file-open');
    assert.equal(failure.creationAttempted, true);
    assert.equal(failure.creationAcknowledged, false);
    assert.equal(failure.creationOutcome, 'unknown');
    assert.equal(failure.uncertainRecord, true);
    assert.equal((await lstat(f.target)).isFile(), true);
    assert.equal(adapterClosed, 1);
    assert(events.includes('directory-close'));
    assert(!events.includes('file-close'));
  }));

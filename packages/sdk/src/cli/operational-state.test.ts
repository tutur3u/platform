import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeOperational } from './operational-cli';
import { checkEvidence } from './operational-evidence';
import { type Board, digest, type Operation } from './operational-schema';
import { initStore, OperationalStore } from './operational-store';
import {
  bundleFrom,
  exportStore,
  importStore,
  migrateStore,
  validateEnvelope,
} from './operational-transfer';

let root: string;
let path: string;
const stores: OperationalStore[] = [];
const entry =
  process.env.TTR_TEST_ENTRY ?? resolve(import.meta.dirname, 'index.ts');
const legacy = resolve(
  import.meta.dirname,
  '../../../../plugins/tuturuuu/scripts/program_backlog.py'
);
const item = (id = 'test-outcome', dependencies: string[] = []) => ({
  id,
  dependencies,
  title: 'Offline outcome',
  source: 'synthetic:test',
  acceptance: 'Preserve history',
  kind: 'feature',
  requiredEvidence: ['focused'],
  priority: 2,
});
const op = (expectedRevision: number): Operation => ({
  expectedRevision,
  operationId: randomUUID(),
});
function store(
  kind: 'backlog' | 'operational-memory' = 'backlog',
  writable = true
) {
  const result = new OperationalStore(path, kind, writable);
  stores.push(result);
  return result;
}
function python(args: string[]) {
  return spawnSync('python3', [legacy, '--db', path, ...args], {
    encoding: 'utf8',
  });
}
function file(name: string, value: unknown) {
  const p = join(root, name);
  writeFileSync(p, JSON.stringify(value), { mode: 0o600 });
  return p;
}
function proof(
  id: string,
  result: 'pass' | 'fail' | 'skipped' | 'pending' = 'pass'
): Board {
  return {
    version: 1,
    units: [
      {
        id,
        owner: 'test',
        worktree: '/synthetic',
        head: 'a'.repeat(40),
        state: 'merged',
        requiredEvidence: ['focused'],
        evidence: [
          {
            kind: 'focused',
            head: 'a'.repeat(40),
            result,
            receipt: 'synthetic:receipt',
          },
        ],
      },
    ],
  };
}
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'ttr-operational-test-')));
  chmodSync(root, 0o700);
  path = join(root, 'state.sqlite');
});
afterEach(() => {
  for (const db of stores.splice(0)) db.close();
  rmSync(root, { recursive: true, force: true });
});

describe('native offline legacy-compatible ledger', () => {
  it('compares evidence gate identities without delimiter collisions', () => {
    initStore(path, 'backlog');
    const db = store();
    db.intake([{ ...item(), requiredEvidence: ['a\0b', 'c'] }], op(0));
    const evidence = proof('test-outcome');
    for (const unit of evidence.units) {
      unit.requiredEvidence = ['a', 'b\0c'];
      unit.evidence = unit.requiredEvidence.map((kind) => ({
        kind,
        head: unit.head,
        result: 'pass',
        receipt: 'synthetic:gate',
      }));
    }
    expect(() =>
      db.update({ id: 'test-outcome', status: 'verified', evidence }, op(1))
    ).toThrow('requirements must match');
    expect(db.revision()).toBe(1);
  });

  it('preserves Python whitespace and omitted legacy defaults on a note-only update', () => {
    expect(python(['init']).status).toBe(0);
    const intake = file('whitespace.json', [
      {
        id: 'legacy-record',
        title: ' title ',
        source: ' source ',
        acceptance: ' acceptance ',
        kind: 'idea',
        requiredEvidence: [' gate '],
      },
    ]);
    expect(python(['intake', intake]).status).toBe(0);
    const original = JSON.parse(python(['snapshot']).stdout).items[0];
    const db = store();
    expect(db.snapshot().items[0]).toEqual(original);
    migrateStore(db, join(root, 'beforeimage.json'), op(1));
    expect(() =>
      db.intake(
        [
          {
            id: 'legacy-record',
            title: 'title',
            source: 'source',
            acceptance: 'acceptance',
            kind: 'idea',
            requiredEvidence: ['gate'],
          },
        ],
        op(1)
      )
    ).toThrow('conflicting intake');
    db.update({ id: 'legacy-record', note: 'only intentional change' }, op(1));
    expect(db.readItems().get('legacy-record')).toEqual({
      ...original,
      note: 'only intentional change',
    });
    expect(JSON.parse(python(['snapshot']).stdout).items[0]).toEqual({
      ...original,
      note: 'only intentional change',
    });
  });

  it('reads without creating a missing database; explicit init is exclusive and private', () => {
    expect(() =>
      executeOperational(['backlog', 'snapshot', '--db', path])
    ).toThrow();
    expect(existsSync(path)).toBe(false);
    expect(() => executeOperational(['backlog', 'init'])).toThrow(
      '--db is required'
    );
    initStore(path, 'backlog');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(() => initStore(path, 'backlog')).toThrow();
  });
  it('preserves Python event bytes, explicitly migrates and is writable by both implementations', () => {
    expect(python(['init']).status).toBe(0);
    const intake = file('intake.json', [item()]);
    expect(python(['intake', intake]).status).toBe(0);
    const db = store();
    const original = db.history();
    expect(db.snapshot()).toMatchObject({
      revision: 1,
      sourceDatabaseId: null,
      items: [{ id: 'test-outcome', status: 'captured' }],
    });
    expect(() =>
      db.update({ id: 'test-outcome', status: 'implemented' }, op(1))
    ).toThrow('explicit migrate');
    const migrateOp = op(1);
    const beforeimage = join(root, 'beforeimage.json');
    const receipt = migrateStore(db, beforeimage, migrateOp);
    expect(db.history()).toEqual(original);
    expect(migrateStore(db, beforeimage, migrateOp)).toEqual(receipt);
    const change = op(1);
    expect(
      python(['update', 'test-outcome', '--note', 'Python changed revision'])
        .status
    ).toBe(0);
    expect(() =>
      db.update({ id: 'test-outcome', status: 'implemented' }, change)
    ).toThrow('current 2');
    db.update({ id: 'test-outcome', status: 'implemented' }, op(2));
    const snapshot = JSON.parse(python(['snapshot']).stdout);
    expect(snapshot.items[0]).toMatchObject({
      status: 'implemented',
      note: 'Python changed revision',
    });
    expect(JSON.parse(python(['history', 'test-outcome']).stdout)).toEqual(
      db.history()
    );
    expect(
      validateEnvelope(JSON.parse(readFileSync(beforeimage, 'utf8'))).events
    ).toEqual(original);
  });
  it('serializes native dedupe and revision while retaining progressed duplicate intake', () => {
    initStore(path, 'backlog');
    const db = store();
    const first = op(0);
    const receipt = db.intake([item()], first);
    expect(db.intake([item()], first)).toEqual(receipt);
    expect(db.revision()).toBe(1);
    expect(() => db.intake([item('other-id')], first)).toThrow(
      'different input'
    );
    db.update({ id: 'test-outcome', status: 'implemented' }, op(1));
    db.intake([item()], op(2));
    expect(db.revision()).toBe(2);
    expect(db.readItems().get('test-outcome')?.status).toBe('implemented');
    expect(() => db.intake([{ ...item(), priority: 0 }], op(2))).toThrow(
      'conflicting intake'
    );
    expect(db.revision()).toBe(2);
  });
  it.each([
    [item('test-outcome', ['missing'])],
    [item('aaa', ['bbb']), item('bbb', ['aaa'])],
    [{ ...item(), priority: true }],
    [{ ...item(), requiredEvidence: [] }],
    [{ ...item(), requiredEvidence: ['x', 'x'] }],
    [{ ...item(), status: 'verified' }],
    [{ ...item(), accessToken: 'must-not-persist' }],
  ])('rolls back invalid intake %#', (...incoming) => {
    initStore(path, 'backlog');
    const db = store();
    expect(() => db.intake(incoming, op(0))).toThrow();
    expect(db.revision()).toBe(0);
    expect(db.readItems().size).toBe(0);
    expect(db.db.prepare('SELECT * FROM operational_operations').all()).toEqual(
      []
    );
  });
  it('requires owners and verified prerequisites without discarding old receipts on recursive reopening', () => {
    initStore(path, 'backlog');
    const db = store();
    db.intake([item('aaa'), item('bbb', ['aaa']), item('ccc', ['bbb'])], op(0));
    expect(() =>
      db.update({ id: 'bbb', status: 'active', owner: 'test' }, op(3))
    ).toThrow('unverified dependencies');
    expect(() => db.update({ id: 'aaa', status: 'active' }, op(3))).toThrow(
      'needs an owner'
    );
    for (const id of ['aaa', 'bbb', 'ccc'])
      db.update(
        { id, status: 'verified', evidence: proof(id) },
        op(db.revision())
      );
    db.update(
      { id: 'aaa', status: 'active', owner: 'test' },
      op(db.revision())
    );
    expect([...db.readItems().values()].map((i) => i.status)).toEqual([
      'active',
      'implemented',
      'implemented',
    ]);
    expect(db.history('ccc').map((e) => JSON.parse(e.payload).status)).toEqual([
      'captured',
      'verified',
      'implemented',
    ]);
    db.update(
      { id: 'aaa', status: 'verified', evidence: proof('aaa') },
      op(db.revision())
    );
    expect(db.readItems().get('bbb')?.status).toBe('implemented');
  });
  it.each(['pending', 'fail', 'skipped'] as const)(
    'does not verify a %s gate',
    (result) => {
      initStore(path, 'backlog');
      const db = store();
      db.intake([item()], op(0));
      expect(() =>
        db.update(
          {
            id: 'test-outcome',
            status: 'verified',
            evidence: proof('test-outcome', result),
          },
          op(1)
        )
      ).toThrow('incomplete');
      expect(db.revision()).toBe(1);
    }
  );
  it('rejects stale, duplicate, foreign gates and unsupported delivered claims', () => {
    const board = proof('test-outcome');
    const unit = board.units[0];
    expect(unit).toBeDefined();
    if (!unit) throw new Error('missing test unit');
    unit.evidence[0] = {
      kind: 'focused',
      head: 'b'.repeat(40),
      result: 'pass',
      receipt: 'synthetic:stale',
    };
    expect(checkEvidence(board)).toMatchObject({
      recordedEvidenceComplete: false,
      units: [{ staleReceipts: 1 }],
    });
    unit.state = 'delivered';
    expect(() => checkEvidence(board)).toThrow('lacks');
    unit.state = 'merged';
    unit.evidence = [...proof('test-outcome').units.flatMap((u) => u.evidence)];
    unit.evidence.push({
      ...unit.evidence[0],
      kind: 'focused',
      head: 'a'.repeat(40),
      result: 'pass',
      receipt: 'duplicate',
    });
    expect(() => checkEvidence(board)).toThrow('duplicate');
    unit.evidence = [
      {
        kind: 'foreign',
        head: 'a'.repeat(40),
        result: 'pass',
        receipt: 'synthetic',
      },
    ];
    expect(() => checkEvidence(board)).toThrow('unknown');
  });
  it('bounds busy failure and leaves no partial receipt or projection', () => {
    initStore(path, 'backlog');
    const db = store();
    const competitor = new DatabaseSync(path);
    competitor.exec('BEGIN IMMEDIATE');
    try {
      expect(() => db.intake([item()], op(0))).toThrow();
    } finally {
      competitor.exec('ROLLBACK');
      competitor.close();
    }
    expect(db.revision()).toBe(0);
  });
});

describe('explicit transfer and separate memory', () => {
  it('exports original history, dry-runs without writes and restores identity and dedupe', () => {
    initStore(path, 'backlog');
    const db = store();
    const capture = op(0);
    db.intake([item()], capture);
    db.update({ id: 'test-outcome', status: 'implemented' }, op(1));
    const bundle = db.read(() => bundleFrom(db));
    const destination = join(root, 'restore.sqlite');
    expect(importStore(destination, 'backlog', bundle)).toMatchObject({
      dryRun: true,
      restore: true,
    });
    expect(existsSync(destination)).toBe(false);
    const restore = op(0);
    const receipt = importStore(destination, 'backlog', bundle, restore);
    expect(importStore(destination, 'backlog', bundle, restore)).toEqual(
      receipt
    );
    const restored = new OperationalStore(destination, 'backlog', true);
    stores.push(restored);
    expect(restored.history()).toEqual(db.history());
    expect(restored.identity()).toBe(db.identity());
    expect(restored.intake([item()], capture)).toEqual(
      JSON.parse(
        db.db
          .prepare(
            'SELECT response_json FROM operational_operations WHERE operation_id=?'
          )
          .get(capture.operationId)
          ?.response_json?.toString() ?? 'null'
      )
    );
    const before = readFileSync(destination);
    expect(importStore(destination, 'backlog', bundle)).toMatchObject({
      dryRun: true,
      importedEvents: 0,
    });
    expect(readFileSync(destination)).toEqual(before);
    exportStore(db, join(root, 'export.json'));
    expect(() => exportStore(db, join(root, 'export.json'))).toThrow();
  });
  it('rejects tampered hashes, missing history, foreign identity and divergent events', () => {
    initStore(path, 'backlog');
    const db = store();
    db.intake([item()], op(0));
    const bundle = db.read(() => bundleFrom(db));
    expect(() => validateEnvelope({ ...bundle, snapshotRevision: 2 })).toThrow(
      'hash'
    );
    const { contentHash: _hash, ...body } = bundle;
    const missing = { ...body, events: [] };
    expect(() =>
      validateEnvelope({ ...missing, contentHash: digest(missing) })
    ).toThrow('history');
    const foreign = { ...body, sourceDatabaseId: randomUUID(), operations: [] };
    expect(() =>
      importStore(path, 'backlog', { ...foreign, contentHash: digest(foreign) })
    ).toThrow('identity');
    const changed = {
      ...body,
      events: body.events.map((e) => ({ ...e, at: 'different' })),
    };
    expect(() =>
      importStore(path, 'backlog', { ...changed, contentHash: digest(changed) })
    ).toThrow('divergent');
  });
  it('refuses symlink sources, ancestors, destinations and nonprivate writes', () => {
    initStore(path, 'backlog');
    const alias = join(root, 'alias.sqlite');
    symlinkSync(path, alias);
    expect(() => new OperationalStore(alias, 'backlog')).toThrow('symlink');
    const aliasDir = join(root, 'aliasdir');
    symlinkSync(root, aliasDir);
    expect(() => initStore(join(aliasDir, 'new.sqlite'), 'backlog')).toThrow(
      'symlink'
    );
    const db = store();
    expect(() => exportStore(db, alias)).toThrow('symlink');
    chmodSync(path, 0o644);
    expect(() => new OperationalStore(path, 'backlog', true)).toThrow('0600');
  });
  it('keeps notes isolated with CAS, history, immutable scope and durable deletion fences', () => {
    initStore(path, 'operational-memory');
    const db = store('operational-memory');
    const note = {
      id: 'lesson-one',
      scope: 'operational:explicit',
      project: 'synthetic',
      source: 'synthetic:test',
      summary: 'Keep histories',
      evidence: ['synthetic:receipt'],
      status: 'active',
    };
    db.putNote(note, op(0));
    expect(() => db.putNote({ ...note, summary: 'conflict' }, op(0))).toThrow(
      'current 1'
    );
    expect(() => db.putNote({ ...note, scope: 'different' }, op(1))).toThrow(
      'immutable'
    );
    db.putNote({ ...note, status: 'tombstone' }, op(1));
    expect(() => db.putNote(note, op(2))).toThrow('resurrected');
    expect(db.history().map((e) => e.action)).toEqual(['put', 'tombstone']);
    const bundle = db.read(() => bundleFrom(db));
    expect(bundle.items).toEqual([]);
    expect(bundle.notes[0]?.status).toBe('tombstone');
    expect(() => new OperationalStore(path, 'backlog').snapshot()).toThrow();
  });
  it('produces exactly one offline JSON object without reading authenticated config', () => {
    const runtime = process.env.TTR_TEST_BUN ?? 'bun';
    const result = spawnSync(runtime, [entry, 'backlog', 'help', '--json'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: join(root, 'missing-home'),
        TUTURUUU_API_URL: 'http://127.0.0.1:1',
        TUTURUUU_DISABLE_UPDATE_CHECK: '1',
      },
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      group: 'backlog',
      liveVerificationPerformed: false,
    });
    expect(
      existsSync(join(root, 'missing-home', '.tuturuuu', 'config.json'))
    ).toBe(false);
    const error = spawnSync(
      runtime,
      [entry, 'backlog', 'snapshot', '--db', path, '--json'],
      { encoding: 'utf8' }
    );
    expect(error.status).toBe(2);
    expect(JSON.parse(error.stdout)).toMatchObject({
      error: { code: 'STORE_OR_FILE_MISSING' },
    });
  });
});

import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  type Board,
  canonical,
  digest,
  type Operation,
} from '../cli/operational-schema';
import { initStore, OperationalStore } from '../cli/operational-store';
import { bundleFrom, validateEnvelope } from '../cli/operational-transfer';
import type { GraphCommand } from './contracts';
import { graphPlan } from './domain';
import { readOutcomeProjectionPageFromPath } from './reader';
import {
  applyGraphCommand,
  readGraphOutcome,
  readGraphReadiness,
} from './store';

let root: string;
let path: string;
let writer: OperationalStore;
const stores: OperationalStore[] = [];
const ids = [
  'canonical-outcome',
  'duplicate-outcome',
  'prerequisite-outcome',
  'dependent-outcome',
];
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'ttr-graph-synthetic-')));
  path = join(root, 'graph.sqlite');
  initStore(path, 'backlog');
  writer = new OperationalStore(path, 'backlog', true);
  stores.push(writer);
  writer.intake(
    ids.map((id, index) => ({
      id,
      title: `Title ${id}`,
      kind: 'feature',
      source: `synthetic:source-${index}`,
      acceptance: `Unique acceptance ${index}`,
      requiredEvidence: ['focused', `unique-${index}`],
    })),
    operation(0)
  );
});
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  rmSync(root, { recursive: true, force: true });
});
function operation(expectedRevision = writer.revision()): Operation {
  return { expectedRevision, operationId: randomUUID() };
}
function apply(change: GraphCommand, op = operation()) {
  return applyGraphCommand({ store: writer, change, operation: op });
}
function reader() {
  const store = new OperationalStore(path, 'backlog');
  stores.push(store);
  return store;
}
function verify(id: string) {
  const item = writer.readItems().get(id);
  if (!item) throw new Error('fixture item missing');
  const board: Board = {
    version: 1,
    units: [
      {
        id,
        owner: 'synthetic-reviewer',
        worktree: '/synthetic',
        head: 'a'.repeat(40),
        state: 'merged',
        requiredEvidence: item.requiredEvidence,
        evidence: item.requiredEvidence.map((kind) => ({
          kind,
          head: 'a'.repeat(40),
          result: 'pass',
          receipt: `synthetic:${id}:${kind}`,
        })),
      },
    ],
  };
  writer.update({ id, status: 'verified', evidence: board }, operation());
}
const merge: GraphCommand = {
  kind: 'merge',
  canonicalId: 'canonical-outcome',
  memberIds: ['duplicate-outcome'],
  reason: 'Explicitly reviewed equivalent requirements',
  confirmation: 'equivalent',
};

it('preserves all unique member content/evidence/history and exposes lossless canonical projection', () => {
  verify('prerequisite-outcome');
  verify('dependent-outcome');
  apply({
    kind: 'dependency',
    id: 'canonical-outcome',
    dependencyId: 'prerequisite-outcome',
    action: 'add',
  });
  apply({
    kind: 'dependency',
    id: 'duplicate-outcome',
    dependencyId: 'dependent-outcome',
    action: 'add',
  });
  for (const id of ids.slice(0, 2)) {
    writer.update(
      { id, note: `Unique note ${id}`, link: `synthetic:link-${id}` },
      operation()
    );
    verify(id);
  }
  const before = writer.readItems();
  const history = writer.history();
  apply(merge);
  const after = writer.readItems();
  for (const id of ids.slice(0, 2)) {
    const original = before.get(id);
    const current = after.get(id);
    if (!original || !current) throw new Error('fixture member missing');
    const { graph: _graph, ...withoutGraph } = current;
    const { graph: _oldGraph, ...originalFields } = original;
    expect(withoutGraph).toEqual(originalFields);
  }
  expect(writer.history().slice(0, history.length)).toEqual(history);
  const page = readOutcomeProjectionPageFromPath({ path });
  const group = page.records.find(
    (record) => record.id === 'canonical-outcome'
  );
  expect(group?.contributingIds).toEqual([
    'canonical-outcome',
    'duplicate-outcome',
  ]);
  expect(group?.members.map((member) => member.item.acceptance)).toEqual([
    'Unique acceptance 0',
    'Unique acceptance 1',
  ]);
  expect(group?.members.map((member) => member.item.requiredEvidence)).toEqual([
    ['focused', 'unique-0'],
    ['focused', 'unique-1'],
  ]);
  expect(group?.members.map((member) => member.item.source)).toEqual([
    'synthetic:source-0',
    'synthetic:source-1',
  ]);
  expect(group?.members.map((member) => member.item.dependencies)).toEqual([
    ['prerequisite-outcome'],
    ['dependent-outcome'],
  ]);
  expect(group?.members.map((member) => member.item.links)).toEqual([
    ['synthetic:link-canonical-outcome'],
    ['synthetic:link-duplicate-outcome'],
  ]);
  expect(
    group?.members.map((member) => member.item.verification?.units[0]?.id)
  ).toEqual(['canonical-outcome', 'duplicate-outcome']);
  expect(page.records.map((record) => record.id)).not.toContain(
    'duplicate-outcome'
  );
  expect(
    readGraphOutcome({ store: reader(), id: 'duplicate-outcome' })
  ).toMatchObject({ canonicalId: 'canonical-outcome' });
});

it('organizes parents and symmetric related edges without granting dependency readiness', () => {
  apply({
    kind: 'parent',
    id: 'duplicate-outcome',
    parentId: 'canonical-outcome',
  });
  apply({
    kind: 'related',
    id: 'canonical-outcome',
    relatedId: 'duplicate-outcome',
    action: 'add',
  });
  expect(
    writer.readItems().get('duplicate-outcome')?.graph?.relatedIds
  ).toEqual(['canonical-outcome']);
  expect(
    readGraphOutcome({ store: reader(), id: 'canonical-outcome' })
  ).toMatchObject({ children: ['duplicate-outcome'] });
  apply({
    kind: 'dependency',
    id: 'canonical-outcome',
    dependencyId: 'prerequisite-outcome',
    action: 'add',
  });
  expect(
    readGraphReadiness({ store: reader(), id: 'canonical-outcome' })
  ).toMatchObject({
    ready: false,
    pendingDependencies: ['prerequisite-outcome'],
  });
  expect(() =>
    writer.update(
      { id: 'canonical-outcome', status: 'active', owner: 'synthetic' },
      operation()
    )
  ).toThrow('unverified dependencies');
  verify('prerequisite-outcome');
  expect(
    readGraphReadiness({ store: reader(), id: 'canonical-outcome' })
  ).toMatchObject({ ready: true });
  apply({
    kind: 'related',
    id: 'canonical-outcome',
    relatedId: 'duplicate-outcome',
    action: 'remove',
  });
  expect(
    writer.readItems().get('duplicate-outcome')?.graph?.relatedIds
  ).toEqual([]);
});

it('rejects parent/dependency cycles and dependency collapse without partial writes or receipts', () => {
  apply({
    kind: 'parent',
    id: 'duplicate-outcome',
    parentId: 'canonical-outcome',
  });
  const before = canonical(writer.snapshot());
  const receipts = writer.operationReceipts().length;
  expect(() =>
    apply({
      kind: 'parent',
      id: 'canonical-outcome',
      parentId: 'duplicate-outcome',
    })
  ).toThrow('cycle');
  expect(() => apply(merge)).toThrow('cycle');
  expect(canonical(writer.snapshot())).toBe(before);
  expect(writer.operationReceipts()).toHaveLength(receipts);
  apply({ kind: 'parent', id: 'duplicate-outcome', parentId: null });
  apply({
    kind: 'dependency',
    id: 'canonical-outcome',
    dependencyId: 'duplicate-outcome',
    action: 'add',
  });
  const dependencyBefore = canonical(writer.snapshot());
  expect(() => apply(merge)).toThrow('cycle');
  expect(() =>
    apply({
      kind: 'dependency',
      id: 'duplicate-outcome',
      dependencyId: 'canonical-outcome',
      action: 'add',
    })
  ).toThrow('cycle');
  expect(canonical(writer.snapshot())).toBe(dependencyBefore);
});

it('revokes dependent verification when canonicalizing an alias adds unresolved unique obligations', () => {
  verify('duplicate-outcome');
  apply({
    kind: 'dependency',
    id: 'dependent-outcome',
    dependencyId: 'duplicate-outcome',
    action: 'add',
  });
  verify('dependent-outcome');
  apply(merge);
  const dependent = writer.readItems().get('dependent-outcome');
  expect(dependent?.status).toBe('implemented');
  expect(dependent?.verification).toBeUndefined();
  expect(dependent?.dependencies).toEqual(['duplicate-outcome']);
  expect(dependent?.invalidatedDependencies).toEqual(['duplicate-outcome']);
  expect(() => verify('dependent-outcome')).toThrow('unverified dependencies');
  verify('canonical-outcome');
  expect(writer.readItems().get('dependent-outcome')?.status).toBe(
    'implemented'
  );
  verify('dependent-outcome');
  expect(writer.readItems().get('dependent-outcome')?.status).toBe('verified');
});

it('requires separate member verification for explicit close, and audited reopen retains old evidence', () => {
  apply(merge);
  expect(() =>
    apply({
      kind: 'close',
      id: 'canonical-outcome',
      reason: 'Confirmed',
      confirmation: 'user-confirmed',
    })
  ).toThrow('unique member obligation');
  verify('canonical-outcome');
  verify('duplicate-outcome');
  apply({
    kind: 'close',
    id: 'canonical-outcome',
    reason: 'Every member checked',
    confirmation: 'user-confirmed',
  });
  const old = writer.history('canonical-outcome');
  apply({
    kind: 'reopen',
    id: 'canonical-outcome',
    reason: 'New demonstrated gap',
  });
  expect(writer.readItems().get('canonical-outcome')).toMatchObject({
    status: 'implemented',
    graph: { disposition: { kind: 'open' } },
  });
  expect(
    writer.readItems().get('canonical-outcome')?.verification
  ).toBeUndefined();
  expect(writer.history('canonical-outcome').slice(0, old.length)).toEqual(old);
  expect(() =>
    apply({ kind: 'reopen', id: 'duplicate-outcome', reason: 'Split' })
  ).toThrow('explicit unmerge');
});

it('unmerges only the current merge identity, preserves history and never restores stale fields', () => {
  const op = operation();
  apply(merge, op);
  writer.update(
    { id: 'duplicate-outcome', note: 'Later unique note' },
    operation()
  );
  const history = writer.history('duplicate-outcome');
  expect(() =>
    apply({
      kind: 'unmerge',
      id: 'duplicate-outcome',
      mergeOperationId: randomUUID(),
      reason: 'Wrong merge',
    })
  ).toThrow('current explicit merge');
  apply({
    kind: 'unmerge',
    id: 'duplicate-outcome',
    mergeOperationId: op.operationId,
    reason: 'Distinct acceptance found',
  });
  expect(writer.readItems().get('duplicate-outcome')).toMatchObject({
    note: 'Later unique note',
    acceptance: 'Unique acceptance 1',
    graph: { disposition: { kind: 'open' } },
  });
  expect(writer.history('duplicate-outcome').slice(0, history.length)).toEqual(
    history
  );
  expect(
    readOutcomeProjectionPageFromPath({ path }).records.map(
      (record) => record.id
    )
  ).toContain('duplicate-outcome');
});

it('reopening a prerequisite transitively clears current verdicts and closed state without discarding historical evidence', () => {
  verify('prerequisite-outcome');
  apply({
    kind: 'dependency',
    id: 'canonical-outcome',
    dependencyId: 'prerequisite-outcome',
    action: 'add',
  });
  verify('canonical-outcome');
  apply({
    kind: 'dependency',
    id: 'dependent-outcome',
    dependencyId: 'canonical-outcome',
    action: 'add',
  });
  verify('dependent-outcome');
  apply({
    kind: 'close',
    id: 'canonical-outcome',
    reason: 'Unique obligations checked',
    confirmation: 'user-confirmed',
  });
  const history = writer.history();
  apply({
    kind: 'reopen',
    id: 'prerequisite-outcome',
    reason: 'Demonstrated regression',
  });
  expect(writer.readItems().get('canonical-outcome')).toMatchObject({
    status: 'implemented',
    graph: { disposition: { kind: 'open' } },
  });
  expect(writer.readItems().get('dependent-outcome')?.status).toBe(
    'implemented'
  );
  expect(writer.history().slice(0, history.length)).toEqual(history);
  verify('prerequisite-outcome');
  expect(writer.readItems().get('canonical-outcome')?.status).toBe(
    'implemented'
  );
  expect(writer.readItems().get('dependent-outcome')?.status).toBe(
    'implemented'
  );
});

it('replays exact original graph receipts after later edits and conflicts changed operation input', () => {
  const op = operation();
  const receipt = apply(merge, op);
  writer.update(
    { id: 'canonical-outcome', note: 'Later canonical note' },
    operation()
  );
  const revision = writer.revision();
  expect(apply(merge, op)).toEqual(receipt);
  expect(writer.revision()).toBe(revision);
  expect(() => apply({ ...merge, reason: 'Changed input' }, op)).toThrow(
    'different input'
  );
  const bundle = bundleFrom(writer);
  expect(validateEnvelope(bundle).operations).toHaveLength(
    writer.operationReceipts().length
  );
  const forged = structuredClone(bundle);
  const graphReceipt = forged.operations.find(
    (value) => value.proof.body.command === 'graph'
  );
  if (!graphReceipt) throw new Error('fixture graph receipt missing');
  graphReceipt.response_json = JSON.stringify({
    result: { changedIds: [] },
    revision: graphReceipt.final_revision,
    sourceDatabaseId: bundle.sourceDatabaseId,
    liveVerificationPerformed: false,
  });
  const { contentHash: _hash, ...body } = forged;
  forged.contentHash = digest(body);
  expect(() => validateEnvelope(forged)).toThrow('response differs');
});

it('fences a second SQLite writer using the original transaction revision without last-writer-wins', () => {
  const second = new OperationalStore(path, 'backlog', true);
  stores.push(second);
  const stale = operation();
  apply({
    kind: 'related',
    id: 'canonical-outcome',
    relatedId: 'duplicate-outcome',
    action: 'add',
  });
  expect(() =>
    applyGraphCommand({
      store: second,
      change: {
        kind: 'related',
        id: 'canonical-outcome',
        relatedId: 'prerequisite-outcome',
        action: 'add',
      },
      operation: stale,
    })
  ).toThrow('current');
  expect(
    writer.readItems().get('canonical-outcome')?.graph?.relatedIds
  ).toEqual(['duplicate-outcome']);
});

it('does not mutate the input map or members when producing reversible plans', () => {
  const items = writer.readItems();
  const before = canonical([...items]);
  const plan = graphPlan(items, merge, randomUUID());
  expect(canonical([...items])).toBe(before);
  const next = new Map(items);
  for (const event of plan.events) next.set(event.item.id, event.item);
  const alias = next.get('duplicate-outcome');
  if (alias?.graph?.disposition.kind !== 'duplicate')
    throw new Error('fixture alias missing');
  const mergedBefore = canonical([...next]);
  graphPlan(
    next,
    {
      kind: 'unmerge',
      id: alias.id,
      mergeOperationId: alias.graph.disposition.mergeOperationId,
      reason: 'Explicit reversal',
    },
    randomUUID()
  );
  expect(canonical([...next])).toBe(mergedBefore);
});

it('refuses graph writes to a synthetic legacy ledger without adoption, export or native metadata', () => {
  const legacyPath = join(root, 'legacy.sqlite');
  const item = writer.readItems().get('canonical-outcome');
  if (!item) throw new Error('fixture member missing');
  const legacy = new DatabaseSync(legacyPath);
  legacy.exec(
    'CREATE TABLE items(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE events(seq INTEGER PRIMARY KEY,item_id TEXT NOT NULL,at TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL)'
  );
  legacy
    .prepare('INSERT INTO items VALUES(?,?)')
    .run(item.id, JSON.stringify(item));
  legacy
    .prepare('INSERT INTO events VALUES(1,?,?,?,?)')
    .run(item.id, '2026-10-12T00:00:00Z', 'capture', JSON.stringify(item));
  legacy.close();
  chmodSync(legacyPath, 0o600);
  const before = readFileSync(legacyPath);
  const unmigrated = new OperationalStore(legacyPath, 'backlog', true);
  stores.push(unmigrated);
  expect(() =>
    applyGraphCommand({
      store: unmigrated,
      change: { kind: 'parent', id: item.id, parentId: null },
      operation: operation(1),
    })
  ).toThrow('requires explicit migrate');
  expect(unmigrated.identity()).toBeNull();
  expect(readFileSync(legacyPath)).toEqual(before);
});

it('rejects forged verified status without its own evidence before creating a closure receipt', () => {
  const items = writer.readItems();
  const member = items.get('canonical-outcome');
  if (!member) throw new Error('fixture member missing');
  const malformed = { ...member, status: 'verified' };
  writer.db
    .prepare('UPDATE items SET payload=? WHERE id=?')
    .run(JSON.stringify(malformed), member.id);
  const before = writer.revision();
  expect(() =>
    apply({
      kind: 'close',
      id: member.id,
      reason: 'Cannot trust status alone',
      confirmation: 'user-confirmed',
    })
  ).toThrow('lacks evidence');
  expect(writer.revision()).toBe(before);
});

it('rejects an alias continuation cursor instead of repeating the first canonical page', () => {
  apply(merge);
  const page = readOutcomeProjectionPageFromPath({ path, limit: 1 });
  const cursor = page.nextCursor;
  if (!cursor) throw new Error('fixture missing canonical continuation');
  expect(() =>
    readOutcomeProjectionPageFromPath({
      path,
      cursor: { ...cursor, afterId: 'duplicate-outcome' },
    })
  ).toThrow('canonical record');
});

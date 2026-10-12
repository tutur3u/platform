import { randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { operationHash, responseSchema } from './operational-receipts';
import { digest } from './operational-schema';
import { initStore, OperationalStore } from './operational-store';
import {
  bundleFrom,
  importStore,
  validateEnvelope,
} from './operational-transfer';

let root: string;
let db: OperationalStore;
const operation = () => ({ operationId: randomUUID(), expectedRevision: 1 });
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'ttr-receipt-proof-')));
  const path = join(root, 'source.sqlite');
  initStore(path, 'backlog');
  db = new OperationalStore(path, 'backlog', true);
  db.intake(
    [
      {
        id: 'receipt-outcome',
        title: 'Fixture',
        kind: 'idea',
        source: 'synthetic:receipt',
        acceptance: 'Exact retained history',
        requiredEvidence: ['focused'],
      },
    ],
    { operationId: randomUUID(), expectedRevision: 0 }
  );
});
afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});
function rehash(bundle: ReturnType<typeof bundleFrom>) {
  const { contentHash: _hash, ...body } = bundle;
  return { ...body, contentHash: digest(body) };
}
it('rejects forged update receipts before import even when envelope integrity is recomputed', () => {
  const op = operation();
  db.update({ id: 'receipt-outcome', note: 'Actual note' }, op);
  const bundle = db.read(() => bundleFrom(db));
  const receipt = bundle.operations.find(
    (r) => r.operation_id === op.operationId
  );
  if (!receipt) throw new Error('fixture receipt missing');
  const response = JSON.parse(receipt.response_json);
  response.result.note = 'Forged receipt note';
  receipt.response_json = JSON.stringify(response);
  const input = rehash(bundle);
  expect(() => validateEnvelope(input)).toThrow();
  expect(() =>
    importStore(join(root, 'restore.sqlite'), 'backlog', input, {
      operationId: randomUUID(),
      expectedRevision: 0,
    })
  ).toThrow();
  expect(db.readItems().get('receipt-outcome')?.note).toBe('Actual note');
});

it('validates replay against original revision while retaining later legitimate updates', () => {
  const op = operation();
  const change = { id: 'receipt-outcome', note: 'Original receipt' };
  const receipt = db.update(change, op);
  db.update(
    { id: 'receipt-outcome', note: 'Later history' },
    { operationId: randomUUID(), expectedRevision: 2 }
  );
  expect(db.update(change, op)).toEqual(receipt);
  const path = join(root, 'restore.sqlite');
  const bundle = db.read(() => bundleFrom(db));
  importStore(path, 'backlog', bundle, {
    operationId: randomUUID(),
    expectedRevision: 0,
  });
  const restored = new OperationalStore(path, 'backlog', true);
  try {
    expect(restored.update(change, op)).toEqual(receipt);
    expect(restored.readItems().get(change.id)?.note).toBe('Later history');
    expect(restored.history()).toEqual(db.history());
  } finally {
    restored.close();
  }
});
it('fails closed on forged persisted replay without advancing events', () => {
  const op = operation();
  const change = { id: 'receipt-outcome', note: 'Actual note' };
  const receipt = responseSchema.parse(db.update(change, op));
  const forged = {
    ...receipt,
    result: { ...receipt.result, note: 'Forged note' },
  };
  db.db
    .prepare(
      'UPDATE operational_operations SET response_json=? WHERE operation_id=?'
    )
    .run(JSON.stringify(forged), op.operationId);
  expect(() => db.update(change, op)).toThrow();
  expect(db.revision()).toBe(2);
  expect(db.readItems().get(change.id)?.note).toBe('Actual note');
});
it.each(['id', 'hash', 'revision', 'event', 'duplicate'] as const)(
  'rejects %s proof tampering without restoring',
  (mutation) => {
    const op = operation();
    db.update({ id: 'receipt-outcome', note: 'Actual' }, op);
    const bundle = db.read(() => bundleFrom(db));
    const receipt = bundle.operations.find(
      (r) => r.operation_id === op.operationId
    );
    if (!receipt) throw new Error('fixture receipt missing');
    if (mutation === 'id') receipt.operation_id = randomUUID();
    if (mutation === 'hash') receipt.payload_hash = '0'.repeat(64);
    if (mutation === 'revision') receipt.proof.initialRevision = 0;
    if (mutation === 'event') {
      const event = receipt.proof.events[0];
      if (!event) throw new Error('fixture event missing');
      event.hash = '0'.repeat(64);
    }
    if (mutation === 'duplicate') bundle.operations.push(receipt);
    expect(() => validateEnvelope(rehash(bundle))).toThrow();
  }
);
it('rejects unproven native receipts and never backfills historical proof', () => {
  const bundle = db.read(() => bundleFrom(db));
  const { contentHash: _hash, ...body } = bundle;
  const unproven = {
    ...body,
    operations: body.operations.map(({ proof: _proof, ...row }) => row),
  };
  expect(() =>
    validateEnvelope({ ...unproven, contentHash: digest(unproven) })
  ).toThrow();
  const history = db.history();
  db.db.exec('DROP TABLE operational_operation_proofs');
  expect(db.snapshot().revision).toBe(1);
  expect(() =>
    db.intake(
      [
        {
          id: 'other-outcome',
          title: 'Other',
          kind: 'idea',
          source: 'synthetic',
          acceptance: 'No backfill',
          requiredEvidence: ['focused'],
        },
      ],
      { operationId: randomUUID(), expectedRevision: 1 }
    )
  ).toThrow('no request/event proof');
  expect(db.history()).toEqual(history);
});
it('records proofs only inside writer transactions', () => {
  expect(() =>
    db.recordOperation(
      operation(),
      { command: 'import', contentHash: '0'.repeat(64) },
      {}
    )
  ).toThrow('original writer transaction');
  expect(db.revision()).toBe(1);
});

it('rejects forged request plus response even when operation and envelope hashes are recomputed', () => {
  const op = operation();
  db.update({ id: 'receipt-outcome', note: 'Actual note' }, op);
  const bundle = db.read(() => bundleFrom(db));
  const receipt = bundle.operations.find(
    (r) => r.operation_id === op.operationId
  );
  if (receipt?.proof.body.command !== 'update')
    throw new Error('fixture update missing');
  receipt.proof.body.change.note = 'Forged note';
  receipt.payload_hash = operationHash('backlog', op, receipt.proof.body);
  const response = responseSchema.parse(JSON.parse(receipt.response_json));
  if (!('note' in response.result)) throw new Error('fixture item missing');
  response.result.note = 'Forged note';
  receipt.response_json = JSON.stringify(response);
  expect(() => validateEnvelope(rehash(bundle))).toThrow(
    'original event interval'
  );
});

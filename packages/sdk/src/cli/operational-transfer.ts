import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { validateOutcomeGraph } from '../operational-graph/domain';
import { validateProjection } from './operational-domain';
import { exclusiveFile, MAX_BYTES, safePath } from './operational-files';
import { receiptSchema, validateReceipt } from './operational-receipts';
import {
  canonical,
  digest,
  eventSchema,
  fail,
  itemSchema,
  noteSchema,
  type Operation,
  parseJson,
} from './operational-schema';
import { OperationalStore, type StoreKind } from './operational-store';

const envelopeSchema = z
  .object({
    version: z.literal(1),
    kind: z.enum(['backlog', 'operational-memory']),
    sourceDatabaseId: z.uuid().nullable(),
    snapshotRevision: z.number().int().nonnegative(),
    items: z.array(itemSchema).max(10_000),
    notes: z.array(noteSchema).max(10_000),
    events: z.array(eventSchema).max(100_000),
    operations: z.array(receiptSchema).max(100_000),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type Envelope = z.infer<typeof envelopeSchema>;

export function validateEnvelope(input: unknown): Envelope {
  const bundle = envelopeSchema.parse(input);
  const { contentHash, ...body } = bundle;
  if (digest(body) !== contentHash)
    fail('HASH_MISMATCH', 'bundle content hash mismatch');
  if (
    (bundle.kind === 'backlog' && bundle.notes.length) ||
    (bundle.kind === 'operational-memory' && bundle.items.length)
  )
    fail('STORE_KIND_MISMATCH', 'bundle mixes stores');
  if (
    bundle.events.length !== bundle.snapshotRevision ||
    bundle.events.some((e, i) => e.seq !== i + 1)
  )
    fail(
      'INVALID_HISTORY',
      'complete contiguous original event history is required'
    );
  const projections = bundle.kind === 'backlog' ? bundle.items : bundle.notes;
  const byId = new Map(projections.map((i) => [i.id, i]));
  if (byId.size !== projections.length)
    fail('INVALID_HISTORY', 'duplicate projection id');
  const latest = new Map<string, unknown>();
  const noteScopes = new Map<
    string,
    { scope: string; project: string; deleted: boolean }
  >();
  for (const event of bundle.events) {
    const record =
      bundle.kind === 'backlog'
        ? itemSchema.parse(parseJson(event.payload))
        : noteSchema.parse(parseJson(event.payload));
    if (record.id !== event.item_id)
      fail('INVALID_HISTORY', 'event id mismatch');
    if ('scope' in record) {
      const prior = noteScopes.get(record.id);
      if (
        prior &&
        (prior.scope !== record.scope || prior.project !== record.project)
      )
        fail('SCOPE_CONFLICT', 'note history changes scope');
      if (prior?.deleted && record.status !== 'tombstone')
        fail('DELETION_FENCE', 'history resurrects a tombstone');
      noteScopes.set(record.id, {
        scope: record.scope,
        project: record.project,
        deleted: record.status === 'tombstone',
      });
    }
    latest.set(record.id, record);
  }
  if (
    latest.size !== byId.size ||
    [...byId].some(
      ([id, record]) => canonical(latest.get(id) ?? null) !== canonical(record)
    )
  )
    fail('INVALID_HISTORY', 'projection differs from final event payload');
  if (bundle.kind === 'backlog') {
    const items = new Map(bundle.items.map((i) => [i.id, i]));
    validateProjection(items);
    validateOutcomeGraph(items);
  }
  const ids = new Set<string>();
  for (const receipt of bundle.operations) {
    if (ids.has(receipt.operation_id))
      fail('OPERATION_CONFLICT', 'duplicate operation receipt');
    ids.add(receipt.operation_id);
    if (!bundle.sourceDatabaseId)
      fail('INVALID_HISTORY', 'legacy bundle cannot contain native receipts');
    validateReceipt(receipt, {
      kind: bundle.kind,
      sourceDatabaseId: bundle.sourceDatabaseId,
      events: bundle.events,
    });
  }
  if (!bundle.sourceDatabaseId && bundle.operations.length)
    fail('INVALID_HISTORY', 'legacy bundle cannot contain native receipts');
  return bundle;
}
export function bundleFrom(store: OperationalStore): Envelope {
  const identity = store.identity();
  const body = {
    version: 1 as const,
    kind: store.kind,
    sourceDatabaseId: identity,
    snapshotRevision: store.revision(),
    items:
      store.kind === 'backlog'
        ? [...store.readItems().values()].sort((a, b) =>
            a.id.localeCompare(b.id, 'en')
          )
        : [],
    notes:
      store.kind === 'operational-memory'
        ? [...store.readNotes().values()].sort((a, b) =>
            a.id.localeCompare(b.id, 'en')
          )
        : [],
    events: store.history(),
    operations: identity
      ? z.array(receiptSchema).parse(store.operationReceipts())
      : [],
  };
  return validateEnvelope({ ...body, contentHash: digest(body) });
}
export function exportStore(store: OperationalStore, file: string) {
  return store.read(() => {
    const bundle = bundleFrom(store);
    const encoded = canonical(bundle);
    if (Buffer.byteLength(encoded) > MAX_BYTES)
      fail(
        'EXPORT_TOO_LARGE',
        'bundle exceeds import size limit; no partial export'
      );
    exclusiveFile(file, encoded);
    return {
      contentHash: bundle.contentHash,
      revision: bundle.snapshotRevision,
      sourceDatabaseId: bundle.sourceDatabaseId,
      liveVerificationPerformed: false,
    };
  });
}
export function migrateStore(
  store: OperationalStore,
  file: string,
  op: Operation
) {
  const body = { command: 'migrate', beforeimage: file };
  if (store.identity())
    return store.mutate(op, body, () =>
      fail('ALREADY_MIGRATED', 'store already has native metadata')
    );
  return store.transaction(() => {
    if (store.revision() !== op.expectedRevision)
      fail('REVISION_CONFLICT', 'legacy revision changed');
    const integrity = store.db.prepare('PRAGMA integrity_check').all();
    if (
      integrity.length !== 1 ||
      !integrity[0] ||
      !Object.values(integrity[0]).includes('ok')
    )
      fail('INVALID_STORE', 'SQLite integrity check failed');
    const bundle = bundleFrom(store);
    if (Buffer.byteLength(canonical(bundle)) > MAX_BYTES)
      fail('EXPORT_TOO_LARGE', 'beforeimage exceeds import size limit');
    exclusiveFile(file, canonical(bundle));
    store.initializeMetadata();
    const response = {
      result: { migrated: true, beforeimageHash: bundle.contentHash },
      revision: store.revision(),
      sourceDatabaseId: store.identity(),
      liveVerificationPerformed: false,
    };
    store.recordOperation(op, body, response);
    return response;
  });
}
export function importPlan(store: OperationalStore, bundle: Envelope) {
  if (bundle.kind !== store.kind)
    fail('STORE_KIND_MISMATCH', 'bundle belongs to another store kind');
  if (!bundle.sourceDatabaseId || bundle.sourceDatabaseId !== store.identity())
    fail(
      'IDENTITY_CONFLICT',
      'different ledger identity; restore into a new explicit path'
    );
  const history = store.history();
  if (
    history.length > bundle.events.length ||
    history.some((e, i) => canonical(e) !== canonical(bundle.events[i]))
  )
    fail(
      'HISTORY_CONFLICT',
      'divergent history; reconcile explicitly without overwriting'
    );
  // Existing projections must match their own retained event history too.
  bundleFrom(store);
  for (const receipt of bundle.operations) {
    const existing = store
      .operationReceipts()
      .find((r) => r.operation_id === receipt.operation_id);
    if (
      existing &&
      canonical(receiptSchema.parse(existing)) !== canonical(receipt)
    )
      fail('OPERATION_CONFLICT', 'divergent operation receipt');
  }
  return { importedEvents: bundle.events.length - history.length };
}
function applyBundle(store: OperationalStore, bundle: Envelope) {
  const plan = importPlan(store, bundle);
  const revision = store.revision();
  for (const event of bundle.events.filter((e) => e.seq > revision)) {
    store.db
      .prepare(`INSERT INTO ${store.eventTable} VALUES(?,?,?,?,?)`)
      .run(event.seq, event.item_id, event.at, event.action, event.payload);
    store.db
      .prepare(
        `INSERT INTO ${store.itemTable} VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`
      )
      .run(event.item_id, event.payload);
  }
  for (const receipt of bundle.operations)
    store.db
      .prepare('INSERT OR IGNORE INTO operational_operations VALUES(?,?,?,?,?)')
      .run(
        receipt.operation_id,
        receipt.payload_hash,
        receipt.initial_revision,
        receipt.final_revision,
        receipt.response_json
      );
  for (const receipt of bundle.operations)
    store.db
      .prepare('INSERT OR IGNORE INTO operational_operation_proofs VALUES(?,?)')
      .run(receipt.operation_id, canonical(receipt.proof));
  return plan;
}
export function importStore(
  path: string,
  kind: StoreKind,
  input: unknown,
  operation?: Operation
) {
  path = safePath(path);
  const bundle = validateEnvelope(input);
  if (bundle.kind !== kind)
    fail('STORE_KIND_MISMATCH', 'bundle belongs to another command group');
  if (!existsSync(path)) {
    if (!bundle.sourceDatabaseId)
      fail(
        'MIGRATION_REQUIRED',
        'legacy backup must be restored with legacy tooling and explicitly migrated'
      );
    if (!operation)
      return {
        dryRun: true,
        restore: true,
        revision: bundle.snapshotRevision,
        liveVerificationPerformed: false,
      };
    if (operation.expectedRevision !== 0)
      fail('REVISION_CONFLICT', 'new restore requires expected revision zero');
    if (bundle.operations.some((r) => r.operation_id === operation.operationId))
      fail(
        'OPERATION_CONFLICT',
        'restore operation id already exists in bundle'
      );
    exclusiveFile(path);
    const store = new OperationalStore(path, kind, true);
    try {
      return store.transaction(() => {
        store.db.exec(
          kind === 'backlog'
            ? 'CREATE TABLE items(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE events(seq INTEGER PRIMARY KEY,item_id TEXT NOT NULL,at TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL);'
            : 'CREATE TABLE operational_notes(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE operational_note_events(seq INTEGER PRIMARY KEY,item_id TEXT NOT NULL,at TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL);'
        );
        store.initializeMetadata(bundle.sourceDatabaseId ?? randomUUID());
        const result = applyBundle(store, bundle);
        const response = {
          result,
          revision: store.revision(),
          sourceDatabaseId: store.identity(),
          liveVerificationPerformed: false,
        };
        store.recordOperation(
          operation,
          { command: 'import', contentHash: bundle.contentHash },
          response
        );
        return response;
      });
    } finally {
      store.close();
    }
  }
  const store = new OperationalStore(path, kind, Boolean(operation));
  try {
    if (!operation)
      return store.read(() => ({
        dryRun: true,
        ...importPlan(store, bundle),
        liveVerificationPerformed: false,
      }));
    return store.mutate(
      operation,
      { command: 'import', contentHash: bundle.contentHash },
      () => applyBundle(store, bundle)
    );
  } finally {
    store.close();
  }
}

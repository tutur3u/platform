import { randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { intakePlan, updatePlan } from './operational-domain';
import { exclusiveFile, privateParent, safePath } from './operational-files';
import {
  canonical,
  digest,
  type Event,
  eventSchema,
  fail,
  type Item,
  itemSchema,
  type Note,
  noteSchema,
  type Operation,
  operationSchema,
  parseJson,
  statuses,
  type Update,
} from './operational-schema';

export type StoreKind = 'backlog' | 'operational-memory';
const valueRow = z.object({ value: z.string() });
const payloadRow = z.object({ id: z.string(), payload: z.string() });
const revisionRow = z.object({ revision: z.number().int().nonnegative() });
export const storeSchema = `
CREATE TABLE operational_store_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE operational_operations(operation_id TEXT PRIMARY KEY,payload_hash TEXT NOT NULL,initial_revision INTEGER NOT NULL,final_revision INTEGER NOT NULL,response_json TEXT NOT NULL);
`;
const backlogSchema =
  'CREATE TABLE items(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE events(seq INTEGER PRIMARY KEY,item_id TEXT NOT NULL,at TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL);';
const memorySchema =
  'CREATE TABLE operational_notes(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE operational_note_events(seq INTEGER PRIMARY KEY,item_id TEXT NOT NULL,at TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL);';

export class OperationalStore {
  readonly db: DatabaseSync;
  private readonly fd: number;
  readonly path: string;
  constructor(
    input: string,
    readonly kind: StoreKind,
    readonly writable = false
  ) {
    this.path = safePath(input);
    this.fd = openSync(this.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let opened: DatabaseSync | undefined;
    try {
      const before = fstatSync(this.fd);
      if (!before.isFile()) fail('UNSAFE_PATH', 'store must be a regular file');
      if (writable) {
        privateParent(this.path);
        if ((before.mode & 0o077) !== 0)
          fail('UNSAFE_PATH', 'store must have private 0600 permissions');
      }
      opened = new DatabaseSync(this.path, { readOnly: !writable });
      const after = lstatSync(this.path);
      if (
        after.isSymbolicLink() ||
        before.ino !== after.ino ||
        before.dev !== after.dev
      )
        fail('UNSAFE_PATH', 'store changed while opening');
      opened.exec('PRAGMA busy_timeout=1000');
      this.db = opened;
    } catch (error) {
      opened?.close();
      closeSync(this.fd);
      throw error;
    }
  }
  close() {
    this.db.close();
    closeSync(this.fd);
  }
  get eventTable() {
    return this.kind === 'backlog' ? 'events' : 'operational_note_events';
  }
  get itemTable() {
    return this.kind === 'backlog' ? 'items' : 'operational_notes';
  }
  revision() {
    return revisionRow.parse(
      this.db
        .prepare(
          `SELECT COALESCE(MAX(seq),0) AS revision FROM ${this.eventTable}`
        )
        .get()
    ).revision;
  }
  identity(): string | null {
    const exists = this.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='operational_store_metadata'"
      )
      .get();
    if (!exists) return null;
    const kind = valueRow.parse(
      this.db
        .prepare(
          "SELECT value FROM operational_store_metadata WHERE key='kind'"
        )
        .get()
    ).value;
    if (kind !== this.kind)
      fail(
        'STORE_KIND_MISMATCH',
        'use the separate store for this command group'
      );
    const version = valueRow.parse(
      this.db
        .prepare(
          "SELECT value FROM operational_store_metadata WHERE key='schemaVersion'"
        )
        .get()
    ).value;
    if (version !== '1')
      fail('UNSUPPORTED_SCHEMA', 'unsupported store version');
    return z
      .uuid()
      .parse(
        valueRow.parse(
          this.db
            .prepare(
              "SELECT value FROM operational_store_metadata WHERE key='sourceDatabaseId'"
            )
            .get()
        ).value
      );
  }
  initializeMetadata(identity: string = randomUUID()) {
    this.db.exec(storeSchema);
    const insert = this.db.prepare(
      'INSERT INTO operational_store_metadata VALUES(?,?)'
    );
    for (const [key, value] of Object.entries({
      schemaVersion: '1',
      sourceDatabaseId: identity,
      kind: this.kind,
    }))
      insert.run(key, value);
  }
  readItems(): Map<string, Item> {
    this.identity();
    const items = new Map<string, Item>();
    for (const input of this.db.prepare('SELECT id,payload FROM items').all()) {
      const row = payloadRow.parse(input);
      const item = itemSchema.parse(parseJson(row.payload));
      if (row.id !== item.id) fail('INVALID_STORE', 'projection id mismatch');
      items.set(row.id, item);
    }
    return items;
  }
  readNotes(): Map<string, Note> {
    this.identity();
    const notes = new Map<string, Note>();
    for (const input of this.db
      .prepare('SELECT id,payload FROM operational_notes')
      .all()) {
      const row = payloadRow.parse(input);
      const note = noteSchema.parse(parseJson(row.payload));
      if (row.id !== note.id) fail('INVALID_STORE', 'note id mismatch');
      notes.set(row.id, note);
    }
    return notes;
  }
  history(id?: string): Event[] {
    this.identity();
    const rows =
      id === undefined
        ? this.db.prepare(`SELECT * FROM ${this.eventTable} ORDER BY seq`).all()
        : this.db
            .prepare(
              `SELECT * FROM ${this.eventTable} WHERE item_id=? ORDER BY seq`
            )
            .all(id);
    return z.array(eventSchema).parse(rows);
  }
  read<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  transaction<T>(fn: () => T): T {
    if (!this.writable) fail('READ_ONLY', 'write requires writable store');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  mutate(operation: Operation, body: unknown, apply: () => unknown) {
    const op = operationSchema.parse(operation);
    const hash = digest({
      kind: this.kind,
      body,
      expectedRevision: op.expectedRevision,
    });
    return this.transaction(() => {
      if (!this.identity())
        fail(
          'MIGRATION_REQUIRED',
          'legacy store requires explicit migrate with a beforeimage export'
        );
      const existing = this.db
        .prepare(
          'SELECT payload_hash,response_json FROM operational_operations WHERE operation_id=?'
        )
        .get(op.operationId);
      if (existing) {
        const receipt = z
          .object({ payload_hash: z.string(), response_json: z.string() })
          .parse(existing);
        if (receipt.payload_hash !== hash)
          fail(
            'OPERATION_CONFLICT',
            'operation id was used with different input'
          );
        return parseJson(receipt.response_json);
      }
      const revision = this.revision();
      if (revision !== op.expectedRevision)
        fail(
          'REVISION_CONFLICT',
          `expected revision ${op.expectedRevision}, current ${revision}`
        );
      const result = {
        result: apply(),
        revision: this.revision(),
        sourceDatabaseId: this.identity(),
        liveVerificationPerformed: false,
      };
      this.db
        .prepare('INSERT INTO operational_operations VALUES(?,?,?,?,?)')
        .run(
          op.operationId,
          hash,
          revision,
          this.revision(),
          canonical(result)
        );
      return result;
    });
  }
  append(item: Item | Note, action: string) {
    const payload = canonical(item);
    this.db
      .prepare(
        `INSERT INTO ${this.eventTable}(item_id,at,action,payload) VALUES(?,?,?,?)`
      )
      .run(item.id, new Date().toISOString(), action, payload);
    this.db
      .prepare(
        `INSERT INTO ${this.itemTable} VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`
      )
      .run(item.id, payload);
  }
  snapshot() {
    return this.read(() => {
      const items = [...this.readItems().values()].sort(
        (a, b) =>
          (a.priority ?? 2) - (b.priority ?? 2) ||
          a.id.localeCompare(b.id, 'en')
      );
      const counts = Object.fromEntries(
        [...statuses]
          .sort()
          .map((s) => [s, items.filter((i) => i.status === s).length])
      );
      return {
        items,
        counts,
        revision: this.revision(),
        sourceDatabaseId: this.identity(),
        liveVerificationPerformed: false,
      };
    });
  }
  intake(input: unknown, op: Operation) {
    return this.mutate(op, { command: 'intake', input }, () => {
      const plan = intakePlan(this.readItems(), input);
      for (const item of plan.added) this.append(item, 'capture');
      return { added: plan.added.map((i) => i.id), retained: plan.retained };
    });
  }
  update(change: Update, op: Operation) {
    return this.mutate(op, { command: 'update', change }, () => {
      const plan = updatePlan(this.readItems(), change);
      for (const event of plan.events) this.append(event.item, event.action);
      return plan.item;
    });
  }
  putNote(input: unknown, op: Operation) {
    const note = noteSchema.parse(input);
    return this.mutate(op, { command: 'put', note }, () => {
      const previous = this.readNotes().get(note.id);
      if (
        previous &&
        (previous.scope !== note.scope || previous.project !== note.project)
      )
        fail('SCOPE_CONFLICT', 'note scope/project is immutable');
      if (previous?.status === 'tombstone' && note.status !== 'tombstone')
        fail('DELETION_FENCE', 'tombstoned notes cannot be resurrected');
      if (!previous || canonical(previous) !== canonical(note))
        this.append(note, note.status === 'tombstone' ? 'tombstone' : 'put');
      return note;
    });
  }
}
export function initStore(path: string, kind: StoreKind) {
  exclusiveFile(path);
  const store = new OperationalStore(path, kind, true);
  try {
    store.transaction(() => {
      store.db.exec(kind === 'backlog' ? backlogSchema : memorySchema);
      store.initializeMetadata();
    });
    return {
      initialized: true,
      sourceDatabaseId: store.identity(),
      revision: 0,
      liveVerificationPerformed: false,
    };
  } finally {
    store.close();
  }
}

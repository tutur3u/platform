import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Item } from '../cli/operational-schema';
import { initStore, OperationalStore } from '../cli/operational-store';
import {
  readOutcomeProjectionPage,
  readOutcomeProjectionPageFromPath,
} from './reader';

let root: string;
const stores: OperationalStore[] = [];
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'ttr-projection-synthetic-')));
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const store of stores.splice(0)) store.close();
  rmSync(root, { recursive: true, force: true });
});
function open(path: string, writable = false) {
  const store = new OperationalStore(path, 'backlog', writable);
  stores.push(store);
  return store;
}
function native() {
  const path = join(root, 'native.sqlite');
  initStore(path, 'backlog');
  const writer = open(path, true);
  writer.intake(
    [
      {
        id: 'alpha-outcome',
        title: 'Alpha',
        kind: 'feature',
        source: 'synthetic:sqlite',
        acceptance: 'Alpha acceptance',
        requiredEvidence: ['focused'],
      },
      {
        id: 'beta-outcome',
        title: 'Beta',
        kind: 'feature',
        source: 'synthetic:sqlite',
        acceptance: 'Beta acceptance',
        requiredEvidence: ['focused'],
      },
    ],
    { expectedRevision: 0, operationId: randomUUID() }
  );
  return { path, writer };
}

it('reads native identity and all members without changing the SQLite file', () => {
  const { path, writer } = native();
  writer.close();
  stores.splice(stores.indexOf(writer), 1);
  const before = readFileSync(path);
  const page = readOutcomeProjectionPageFromPath({ path });
  expect(page.revision).toBe(2);
  expect(page.semanticCacheAllowed).toBe(true);
  expect(
    page.records.map((record) => record.members[0]?.item.acceptance)
  ).toEqual(['Alpha acceptance', 'Beta acceptance']);
  expect(readFileSync(path)).toEqual(before);
});

it('binds identity, revision, items and history to one SQLite snapshot during a concurrent write', () => {
  const { path, writer } = native();
  writer.db.exec('PRAGMA journal_mode=WAL');
  writer.update(
    { id: 'beta-outcome', note: 'synthetic WAL seed' },
    { expectedRevision: 2, operationId: randomUUID() }
  );
  const reader = open(path);
  const readItems = reader.readItems.bind(reader);
  vi.spyOn(reader, 'readItems').mockImplementationOnce(() => {
    const items = readItems();
    writer.update(
      { id: 'alpha-outcome', note: 'concurrent note' },
      { expectedRevision: 3, operationId: randomUUID() }
    );
    return items;
  });
  const read = vi.spyOn(reader, 'read');
  const page = readOutcomeProjectionPage({ store: reader, limit: 1 });
  expect(read).toHaveBeenCalledTimes(1);
  expect(page.revision).toBe(3);
  expect(page.records[0]?.members[0]?.item.note).toBe('');
  expect(page.records[0]?.members[0]?.provenance.lastEventSeq).toBe(1);
  expect(writer.revision()).toBe(4);
  const cursor = page.nextCursor;
  if (!cursor) throw new Error('fixture missing continuation');
  expect(() => readOutcomeProjectionPage({ store: reader, cursor })).toThrow(
    'different snapshot'
  );
  expect(
    readOutcomeProjectionPage({ store: reader }).records[0]?.members[0]?.item
      .note
  ).toBe('concurrent note');
});

it('reads a synthetic legacy fixture without adding identity or schema tables', () => {
  const path = join(root, 'legacy.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(
    'CREATE TABLE items(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE events(seq INTEGER PRIMARY KEY,item_id TEXT NOT NULL,at TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL)'
  );
  const item: Item = {
    id: 'legacy-outcome',
    title: 'Legacy',
    kind: 'feature',
    source: 'synthetic:legacy',
    acceptance: 'Legacy acceptance',
    requiredEvidence: ['focused'],
    status: 'captured',
    owner: '',
    links: ['synthetic:legacy-link'],
    note: 'Legacy note',
  };
  legacy
    .prepare('INSERT INTO items VALUES(?,?)')
    .run(item.id, JSON.stringify(item));
  legacy
    .prepare('INSERT INTO events VALUES(1,?,?,?,?)')
    .run(item.id, '2026-10-12T00:00:00Z', 'capture', JSON.stringify(item));
  legacy.close();
  const before = readFileSync(path);
  const page = readOutcomeProjectionPageFromPath({ path });
  expect(page.sourceDatabaseId).toBeNull();
  expect(page.semanticCacheAllowed).toBe(false);
  expect(page.records[0]?.members[0]?.item).toEqual(item);
  expect(readFileSync(path)).toEqual(before);
});

it('does not create a missing store and rejects writable readers or another store kind', () => {
  const missing = join(root, 'missing.sqlite');
  expect(() => readOutcomeProjectionPageFromPath({ path: missing })).toThrow();
  expect(existsSync(missing)).toBe(false);
  const { writer } = native();
  expect(() => readOutcomeProjectionPage({ store: writer })).toThrow(
    'read-only store'
  );
  const memory = join(root, 'memory.sqlite');
  initStore(memory, 'operational-memory');
  const notes = new OperationalStore(memory, 'operational-memory');
  stores.push(notes);
  expect(() => readOutcomeProjectionPage({ store: notes })).toThrow(
    'backlog store'
  );
});

it('rejects extra caller snapshot properties rather than overriding authoritative SQLite data', () => {
  const { path } = native();
  const reader = open(path);
  const injected = {
    store: reader,
    snapshot: {
      sourceDatabaseId: '33333333-3333-4333-8333-333333333333',
      revision: 0,
      items: [],
      events: [],
    },
  };
  expect(() => readOutcomeProjectionPage(injected)).toThrow();
  const pathInput = { path, snapshot: injected.snapshot };
  expect(() => readOutcomeProjectionPageFromPath(pathInput)).toThrow();
  expect(
    readOutcomeProjectionPage({ store: reader }).records.map(
      (record) => record.id
    )
  ).toEqual(['alpha-outcome', 'beta-outcome']);
});

it('rejects an oversized stored projection before loading its payloads', () => {
  const { path, writer } = native();
  writer.db
    .prepare('UPDATE items SET payload=? WHERE id=?')
    .run('x'.repeat(32 * 1024 * 1024 + 1), 'alpha-outcome');
  const reader = open(path);
  const readItems = vi.spyOn(reader, 'readItems');
  expect(() => readOutcomeProjectionPage({ store: reader })).toThrow(
    '32 MiB input bounds'
  );
  expect(readItems).not.toHaveBeenCalled();
});

import { describe, expect, it } from 'vitest';
import { defineDatabase } from './database';
import {
  defineStatement,
  defineStatements,
  type Statement,
  statementStore,
} from './statements';
import { tables } from './test-support/fixture';
import { openSqlite } from './test-support/sqlite';
import { FakeDatabase } from './testing';

const base = {
  name: 'case',
  table: 'tags',
  action: 'list',
  predicate: 'reviewed',
  params: () => [],
} as const;

const define = (sql: string, over: Partial<Statement<void>> = {}) =>
  defineStatement<void>({ ...base, sql, ...over });

const register = (registry: ReturnType<typeof defineStatements>) =>
  defineDatabase({
    dialect: new FakeDatabase().dialect,
    tables,
    statements: registry,
  });

const sqlite = await openSqlite();

const TWO_TENANTS =
  'SELECT tags.id, notes.title FROM tags JOIN notes ON notes.id = tags.note_id WHERE tags.ws_id = ?1 AND notes.ws_id = ?1';

describe('a raw statement touches one tenant table', () => {
  it('refuses a second tenant table even with its own ws_id = ?1', () => {
    expect(() => register(defineStatements([define(TWO_TENANTS)]))).toThrow(
      /notes/
    );
  });

  it('accepts global tables and the declared table under two aliases', () => {
    const withGlobal = define(
      'SELECT t.id, c.name FROM tags t LEFT JOIN countries c ON c.code = t.name WHERE t.ws_id = ?1'
    );
    const selfJoin = define(
      'SELECT a.id FROM tags a JOIN tags b ON b.note_id = a.note_id WHERE a.ws_id = ?1 AND b.ws_id = ?1',
      { name: 'self' }
    );
    expect(() =>
      register(defineStatements([withGlobal, selfJoin]))
    ).not.toThrow();
  });

  it.skipIf(!sqlite)(
    'would otherwise read rows of the second tenant table',
    () => {
      sqlite!.exec(`
        create table tags (id text, ws_id text, note_id text, name text);
        create table notes (id text, ws_id text, title text, creator_id text);
        insert into tags values ('t1', 'ws-a', 'n1', 'x');
        insert into notes values ('n1', 'ws-a', 'private note', 'u');
      `);
      expect(sqlite!.prepare(TWO_TENANTS).all('ws-a')).toEqual([
        { id: 't1', title: 'private note' },
      ]);
      expect(() => register(defineStatements([define(TWO_TENANTS)]))).toThrow(
        /notes/
      );
    }
  );
});

describe('admission metadata stays private', () => {
  it('exposes only frozen execution fields', () => {
    const statement = define('SELECT id FROM tags WHERE ws_id = ?1');
    const store = statementStore(defineStatements([statement]));
    const stored = store.get('case') as unknown as Record<string, unknown>;
    expect(stored.parsed).toBeUndefined();
    expect(() => {
      stored.sql = 'DELETE FROM tags';
    }).toThrow(TypeError);
    expect(() => {
      (store.list() as unknown[]).push({});
    }).toThrow(TypeError);
    expect(store.get('case')?.sql).toBe('SELECT id FROM tags WHERE ws_id = ?1');
  });

  it('still refuses a system table after mutation attempts', () => {
    const sql = 'SELECT tags.id FROM tags, audit_log WHERE tags.ws_id = ?1';
    const registry = defineStatements([define(sql)]);
    const stored = statementStore(registry).get('case') as unknown as {
      parsed?: { sources?: unknown[]; scoped?: Set<string> };
    };
    try {
      stored.parsed?.sources?.splice(1, 1);
      stored.parsed?.scoped?.add('audit_log');
    } catch {
      // Frozen metadata may throw; either way admission must still refuse.
    }
    expect(() => register(registry)).toThrow(/audit_log/);
  });
});

describe('control characters', () => {
  it.each([
    [
      'NUL inside a literal',
      "SELECT id FROM tags WHERE ws_id = ?1 AND name = 'a\u0000b'",
    ],
    ['NUL outside a literal', 'SELECT id FROM tags WHERE ws_id = ?1\u0000'],
    [
      'SOH inside a literal',
      "SELECT id FROM tags WHERE ws_id = ?1 AND name = 'a\u0001b'",
    ],
    [
      'ESC inside a literal',
      "SELECT id FROM tags WHERE ws_id = ?1 AND name = 'a\u001bb'",
    ],
    [
      'DEL inside a literal',
      "SELECT id FROM tags WHERE ws_id = ?1 AND name = 'a\u007fb'",
    ],
    [
      'vertical tab inside a literal',
      "SELECT id FROM tags WHERE ws_id = ?1 AND name = 'a\u000bb'",
    ],
  ])('refuses %s', (_label, sql) => {
    expect(() => define(sql)).toThrow(/control/);
  });

  it('allows tab and newline inside a literal', () => {
    expect(() =>
      define("SELECT id FROM tags WHERE ws_id = ?1 AND name = 'a\tb\nc'")
    ).not.toThrow();
  });
});

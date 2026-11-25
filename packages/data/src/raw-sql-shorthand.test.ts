import { describe, expect, it } from 'vitest';
import { createInvocationBudget } from './budget';
import { forPrincipal } from './client';
import { defineDatabase } from './database';
import {
  defineStatement,
  defineStatements,
  type Statement,
  statementStore,
} from './statements';
import { principal, setup, tables, WS_A } from './test-support/fixture';
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

const sqlite = await openSqlite();

describe('SQLite shorthands that name a table without FROM', () => {
  it.each([
    ['IN a table', 'SELECT id FROM tags WHERE ws_id = ?1 AND note_id IN notes'],
    [
      'NOT IN a table',
      'SELECT id FROM tags WHERE ws_id = ?1 AND note_id NOT IN audit_log',
    ],
    [
      'IN a schema table',
      'SELECT id FROM tags WHERE ws_id = ?1 AND note_id IN main.notes',
    ],
    [
      'IN a table function',
      'SELECT id FROM tags WHERE ws_id = ?1 AND note_id IN json_each(?2)',
    ],
    [
      'IN a list with an identifier',
      'SELECT id FROM tags WHERE ws_id = ?1 AND note_id IN (?2, name)',
    ],
    [
      'IN an empty list',
      'SELECT id FROM tags WHERE ws_id = ?1 AND note_id IN ()',
    ],
    ['INDEXED BY', 'SELECT id FROM tags INDEXED BY tags_idx WHERE ws_id = ?1'],
    ['NOT INDEXED', 'SELECT id FROM tags NOT INDEXED WHERE ws_id = ?1'],
    ['MATCH', 'SELECT id FROM tags WHERE ws_id = ?1 AND tags MATCH ?2'],
    ['REINDEX', 'SELECT id FROM tags WHERE ws_id = ?1 AND reindex = 1'],
    ['WITHOUT', 'SELECT id FROM tags WHERE ws_id = ?1 AND without = 1'],
  ])('refuses %s', (_label, sql) => {
    expect(() => define(sql)).toThrow();
  });

  it('accepts IN with a flat list of parameters and literals', () => {
    expect(() =>
      define("SELECT id FROM tags WHERE ws_id = ?1 AND name IN (?2, 'red', 3)")
    ).not.toThrow();
    expect(() =>
      define('SELECT id FROM tags WHERE ws_id = ?1 AND name NOT IN (?2)')
    ).not.toThrow();
  });

  it.skipIf(!sqlite)(
    'cannot register a statement that reads another table through IN',
    () => {
      sqlite!.exec(`
        create table secrets (value text);
        create table tags (id text, ws_id text, note_id text, name text);
        insert into secrets values ('n1');
        insert into tags values ('t1', 'ws-a', 'n1', 'x');
      `);
      const sql = 'SELECT id FROM tags WHERE ws_id = ?1 AND note_id IN secrets';
      // SQLite really reads `secrets` through the shorthand.
      expect(sqlite!.prepare(sql).all('ws-a')).toEqual([{ id: 't1' }]);
      expect(() => define(sql)).toThrow(/IN/);
    }
  );
});

describe('whitespace outside literals is ASCII only', () => {
  it('refuses a no-break space between tokens or after the semicolon', () => {
    expect(() => define('SELECT id FROM tags WHERE ws_id = ?1')).toThrow();
    expect(() => define('SELECT id FROM tags WHERE ws_id = ?1; ')).toThrow();
    expect(() => define('SELECT id FROM tags WHERE ws_id = ?1 ')).toThrow();
  });

  it('allows a no-break space inside a string literal', () => {
    expect(() =>
      define("SELECT id FROM tags WHERE ws_id = ?1 AND name = 'a b'")
    ).not.toThrow();
  });
});

describe('the invocation budget is required', () => {
  it('refuses a client built without a budget', () => {
    const { engine, database } = setup();
    expect(() =>
      (forPrincipal as (...args: unknown[]) => unknown)(
        engine,
        principal,
        database
      )
    ).toThrow(/budget/);
    expect(() =>
      (forPrincipal as (...args: unknown[]) => unknown)(
        engine,
        principal,
        database,
        {}
      )
    ).toThrow(/budget/);
  });

  it('is shared by clients built from one handle', async () => {
    const { engine, database, fake } = setup();
    const budget = createInvocationBudget(2);
    const one = forPrincipal(engine, principal, database, { budget });
    const two = forPrincipal(engine, principal, database, { budget });
    const notes = await one.scope('notes', 'list', WS_A);
    await one.execute(
      one.scoped(one.builder.selectFrom('notes').selectAll(), notes)
    );
    const insert = await two.insertInto('tags', WS_A, [
      { id: 't', note_id: 'n', name: 'x' },
    ]);
    await two.batch([insert]);
    expect(budget.used).toBe(2);
    await expect(two.batch([insert])).rejects.toMatchObject({
      code: 'budget_exceeded',
    });
    expect(fake.executed).toHaveLength(1);
    expect(fake.batches).toHaveLength(1);
  });
});

describe('the statement store is read-only', () => {
  it('cannot be cleared through the internal accessor', async () => {
    const statement = defineStatement<void>({
      ...base,
      name: 'tags.ids',
      sql: 'SELECT id FROM tags WHERE ws_id = ?1',
    });
    const statements = defineStatements([statement]);
    const store = statementStore(statements) as unknown as {
      clear?: () => void;
      set?: (name: string, value: unknown) => void;
    };
    expect(store.clear).toBeUndefined();
    expect(store.set).toBeUndefined();
    const { client, fake } = setup({ statements });
    const tags = await client.scope('tags', 'list', WS_A);
    await client.run(statement, tags, undefined);
    expect(fake.executed[0]?.sql).toBe('SELECT id FROM tags WHERE ws_id = ?1');
    expect(() =>
      defineDatabase({
        dialect: new FakeDatabase().dialect,
        tables,
        statements,
      })
    ).not.toThrow();
  });
});

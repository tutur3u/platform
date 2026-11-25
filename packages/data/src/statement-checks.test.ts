import { describe, expect, it } from 'vitest';
import * as budgetModule from './budget';
import { forPrincipal } from './client';
import { defineDatabase } from './database';
import {
  defineStatement,
  defineStatements,
  type Statement,
} from './statements';
import { principal, setup, tables, WS_A } from './test-support/fixture';
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

const register = (sql: string, over: Partial<Statement<void>> = {}) =>
  defineDatabase({
    dialect: new FakeDatabase().dialect,
    tables,
    statements: defineStatements([define(sql, over)]),
  });

describe('raw statements are checked semantically', () => {
  it.each([
    ['a line comment', 'SELECT id FROM tags WHERE ws_id = ?1 -- note'],
    ['a block comment', 'SELECT id FROM tags WHERE name = ?2 /* ws_id = ?1 */'],
    ['an OR arm', 'SELECT id FROM tags WHERE ws_id = ?1 OR 1 = 1'],
    [
      'the predicate in an OR arm',
      'SELECT id FROM tags WHERE name = ?2 OR ws_id = ?1',
    ],
    ['a negated predicate', 'SELECT id FROM tags WHERE NOT ws_id = ?1'],
    ['a wrapped predicate', 'SELECT id FROM tags WHERE (ws_id = ?1) IS NULL'],
    ['a trailing operator', 'SELECT id FROM tags WHERE ws_id = ?1 IS 0'],
    [
      'a CASE expression',
      'SELECT id FROM tags WHERE CASE WHEN 1 AND ws_id = ?1 AND 1 THEN 1 END',
    ],
    ['BETWEEN', 'SELECT id FROM tags WHERE id BETWEEN 1 AND ws_id = ?1'],
    [
      'a subquery',
      'SELECT id FROM tags WHERE ws_id = ?1 AND id IN (SELECT note_id FROM tags)',
    ],
    [
      'UNION',
      'SELECT id FROM tags WHERE ws_id = ?1 UNION SELECT code FROM countries',
    ],
    ['WITH', 'WITH t AS (SELECT 1) SELECT id FROM tags WHERE ws_id = ?1'],
    ['a second statement', 'SELECT id FROM tags WHERE ws_id = ?1; SELECT 1;'],
    ['a quoted identifier', 'SELECT id FROM tags WHERE "ws_id" = ?1'],
    [
      'an unnumbered parameter',
      'SELECT id FROM tags WHERE ws_id = ?1 AND name = ?',
    ],
    [
      'a named parameter',
      'SELECT id FROM tags WHERE ws_id = ?1 AND name = :name',
    ],
    [
      'a RIGHT JOIN',
      'SELECT tags.id FROM countries RIGHT JOIN tags ON 1 = 1 WHERE tags.ws_id = ?1',
    ],
    ['a schema-qualified table', 'SELECT id FROM main.tags WHERE ws_id = ?1'],
    [
      'an ambiguous unqualified predicate',
      'SELECT tags.id FROM tags, notes WHERE ws_id = ?1',
    ],
  ])('refuses %s', (_label, sql) => {
    expect(() => define(sql)).toThrow();
  });

  it.each([
    ['list', 'DELETE FROM tags WHERE ws_id = ?1'],
    ['delete', 'SELECT id FROM tags WHERE ws_id = ?1'],
    ['update', 'INSERT INTO tags (id, ws_id) VALUES (?2, ?1)'],
    ['create', 'UPDATE tags SET name = ?2 WHERE ws_id = ?1'],
    ['archive', 'UPDATE tags SET name = ?2 WHERE ws_id = ?1'],
  ])('refuses a %s statement whose verb does not match: %s', (action, sql) => {
    expect(() => define(sql, { action })).toThrow(/verb/);
  });

  it('refuses writes that touch ws_id or skip ?1', () => {
    expect(() =>
      define('UPDATE tags SET ws_id = ?2 WHERE ws_id = ?1', {
        action: 'update',
      })
    ).toThrow(/ws_id/);
    expect(() =>
      define('UPDATE tags SET name = ?2 FROM notes WHERE tags.ws_id = ?1', {
        action: 'update',
      })
    ).toThrow();
    expect(() =>
      define('INSERT INTO tags (id, ws_id) VALUES (?2, ?2)', {
        action: 'create',
      })
    ).toThrow(/\?1/);
    expect(() =>
      define('INSERT INTO tags (id, name) VALUES (?2, ?3)', {
        action: 'create',
      })
    ).toThrow(/ws_id/);
    expect(() =>
      define('INSERT INTO tags (id, ws_id) VALUES (?2, ?1), (?3, ?3)', {
        action: 'create',
      })
    ).toThrow(/\?1/);
    expect(() =>
      define(
        'INSERT INTO tags (id, ws_id) SELECT id, ws_id FROM tags WHERE ws_id = ?1',
        { action: 'create' }
      )
    ).toThrow();
    expect(() =>
      define(
        'INSERT INTO tags (id, ws_id) VALUES (?2, ?1) ON CONFLICT DO NOTHING',
        { action: 'create' }
      )
    ).toThrow();
  });

  it('accepts well-formed statements of each verb', () => {
    expect(() =>
      define(
        'select count(*) as n from tags t where t.ws_id = ?1 and name = ?2;'
      )
    ).not.toThrow();
    expect(() => define('SELECT id FROM tags WHERE ?1 = ws_id')).not.toThrow();
    expect(() =>
      define("UPDATE tags SET name = name || '' WHERE ws_id = ?1", {
        action: 'update',
      })
    ).not.toThrow();
    expect(() =>
      define('DELETE FROM tags WHERE ws_id = ?1 AND id = ?2', {
        action: 'delete',
      })
    ).not.toThrow();
    expect(() =>
      define(
        'INSERT INTO tags (id, ws_id, name) VALUES (?2, ?1, ?3), (?4, ?1, ?5) RETURNING id',
        { action: 'create' }
      )
    ).not.toThrow();
  });

  it('checks every source against the table registry', () => {
    const joined =
      'SELECT tags.id FROM tags JOIN notes ON notes.id = tags.note_id WHERE tags.ws_id = ?1';
    expect(() => register(joined)).toThrow(/notes/);
    expect(() => register(`${joined} AND notes.ws_id = ?1`)).toThrow(/second/);
    expect(() =>
      register(
        'SELECT t.id FROM tags t LEFT JOIN countries c ON c.code = t.name WHERE t.ws_id = ?1'
      )
    ).not.toThrow();
    expect(() =>
      register('SELECT tags.id FROM tags, audit_log WHERE tags.ws_id = ?1')
    ).toThrow(/audit_log/);
    expect(() =>
      register('SELECT tags.id FROM tags, secrets WHERE tags.ws_id = ?1')
    ).toThrow(/secrets/);
    expect(() =>
      register('SELECT code FROM countries WHERE ws_id = ?1', {
        table: 'countries',
      })
    ).toThrow(/countries/);
    expect(() => register('SELECT id FROM notes WHERE ws_id = ?1')).toThrow(
      /tags/
    );
  });
});

describe('the statement registry is bound to immutable text', () => {
  it('executes the registered copy, not the caller object', async () => {
    const source = {
      ...base,
      name: 'tags.mutable',
      sql: 'SELECT id FROM tags WHERE ws_id = ?1',
    };
    const statements = defineStatements([source as Statement<void>]);
    source.sql = 'DELETE FROM tags WHERE 1 = 1';
    const { client, fake } = setup({ statements });
    const tags = await client.scope('tags', 'list', WS_A);
    await client.run(source as Statement<void>, tags, undefined);
    expect(fake.executed[0]?.sql).toBe('SELECT id FROM tags WHERE ws_id = ?1');
    expect(
      Object.isFrozen(define('SELECT id FROM tags WHERE ws_id = ?1'))
    ).toBe(true);
  });

  it('refuses a structurally built registry', () => {
    const forged = { has: () => true, names: () => ['x'] };
    expect(() =>
      defineDatabase({
        dialect: new FakeDatabase().dialect,
        tables,
        statements: forged as never,
      })
    ).toThrow(/defineStatements/);
  });
});

describe('the query budget is invocation-scoped and capped', () => {
  const { createInvocationBudget } = budgetModule as unknown as {
    createInvocationBudget: (limit?: number) => budgetModule.QueryBudget;
  };

  it('never raises the cap above 1,000', () => {
    expect(createInvocationBudget(5000).limit).toBe(1000);
    expect(createInvocationBudget(10).limit).toBe(10);
    expect(createInvocationBudget().limit).toBe(1000);
  });

  it('is shared by every client of the invocation', async () => {
    const { engine, database, fake } = setup();
    const budget = createInvocationBudget(3);
    const one = forPrincipal(engine, principal, database, { budget });
    const two = forPrincipal(engine, principal, database, { budget });
    const notes = await one.scope('notes', 'list', WS_A);
    await one.execute(
      one.scoped(one.builder.selectFrom('notes').selectAll(), notes)
    );
    const tag = { id: 't', note_id: 'n', name: 'x' };
    const inserts = [
      await two.insertInto('tags', WS_A, [tag]),
      await two.insertInto('tags', WS_A, [tag]),
    ];
    await two.batch(inserts);
    expect(budget.used).toBe(3);
    await expect(
      one.execute(
        one.scoped(one.builder.selectFrom('notes').selectAll(), notes)
      )
    ).rejects.toMatchObject({ code: 'budget_exceeded' });
    await expect(two.batch(inserts.slice(0, 1))).rejects.toMatchObject({
      code: 'budget_exceeded',
    });
    expect(fake.executed).toHaveLength(1);
    expect(fake.batches).toHaveLength(1);
  });

  it('refuses a budget it did not create', () => {
    const { engine, database } = setup();
    const forged = { limit: 1e9, used: 0, take() {} };
    expect(() =>
      forPrincipal(engine, principal, database, { budget: forged })
    ).toThrow(/budget/);
  });
});

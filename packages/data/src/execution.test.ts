import { describe, expect, it } from 'vitest';
import { createInvocationBudget } from './budget';
import { forPrincipal } from './client';
import { DataError } from './errors';
import { defineStatement, defineStatements } from './statements';
import { principal, setup, WS_A } from './test-support/fixture';

const countTags = defineStatement<{ name: string }>({
  name: 'tags.countByName',
  table: 'tags',
  action: 'list',
  predicate: 'Counts rows of workspace ?1 only: ws_id = ?1 is a top-level AND.',
  sql: 'SELECT count(*) AS n FROM tags WHERE ws_id = ?1 AND name = ?2',
  params: (input) => [input.name],
});

const updateNoteTitles = defineStatement<void>({
  name: 'notes.touchAll',
  table: 'notes',
  action: 'update',
  predicate: 'Updates rows of workspace ?1 only.',
  sql: "UPDATE notes SET title = title || '' WHERE ws_id = ?1",
  params: () => [],
});

describe('query budget', () => {
  it('fails before execution once the budget is spent', async () => {
    const { engine, database, fake, client } = setup();
    const budget = createInvocationBudget(2);
    const limited = forPrincipal(engine, principal, database, { budget });
    const notes = await limited.scope('notes', 'list', WS_A);
    const query = () =>
      limited.scoped(limited.builder.selectFrom('notes').selectAll(), notes);
    await limited.execute(query());
    await limited.execute(query());
    await expect(limited.execute(query())).rejects.toMatchObject({
      code: 'budget_exceeded',
    });
    expect(fake.executed).toHaveLength(2);
    expect(client.budget.limit).toBe(1000);
  });

  it('charges a whole batch up front', async () => {
    const { engine, database, fake } = setup();
    const limited = forPrincipal(engine, principal, database, {
      budget: createInvocationBudget(2),
    });
    const tag = { id: 't', note_id: 'n', name: 'x' };
    const inserts = await Promise.all(
      [1, 2, 3].map(() => limited.insertInto('tags', WS_A, [tag]))
    );
    await expect(limited.batch(inserts)).rejects.toMatchObject({
      code: 'budget_exceeded',
    });
    expect(fake.batches).toHaveLength(0);
    await limited.batch(inserts.slice(0, 2));
    expect(fake.batches[0]).toHaveLength(2);
    expect(limited.budget.used).toBe(2);
  });

  it('refuses a batch when no batch executor was injected', async () => {
    const { client } = setup({ batch: false });
    const insert = await client.insertInto('tags', WS_A, [
      { id: 't', note_id: 'n', name: 'x' },
    ]);
    await expect(client.batch([insert])).rejects.toMatchObject({
      code: 'refused',
    });
  });

  it('guards every statement of a batch before running any', async () => {
    const { client, fake } = setup();
    const insert = await client.insertInto('tags', WS_A, [
      { id: 't', note_id: 'n', name: 'x' },
    ]);
    const unscoped = client.builder.deleteFrom('tags');
    await expect(
      client.batch([insert, unscoped as never])
    ).rejects.toBeInstanceOf(DataError);
    expect(fake.batches).toHaveLength(0);
    expect(client.budget.used).toBe(0);
  });
});

describe('raw statement registry', () => {
  it('validates statements when they are defined', () => {
    const base = {
      name: 'x',
      table: 'tags',
      action: 'list',
      predicate: 'reviewed',
      params: () => [],
    } as const;
    expect(() =>
      defineStatement({ ...base, sql: 'SELECT * FROM tags' })
    ).toThrow(/ws_id = \?1/);
    expect(() =>
      defineStatement({ ...base, sql: 'SELECT * FROM tags WHERE ws_id = ?10' })
    ).toThrow(/ws_id = \?1/);
    expect(() =>
      defineStatement({
        ...base,
        predicate: ' ',
        sql: 'SELECT 1 FROM tags WHERE ws_id = ?1',
      })
    ).toThrow(/predicate/);
    expect(() =>
      defineStatement({
        ...base,
        sql: 'INSERT OR REPLACE INTO tags SELECT * FROM tags WHERE ws_id = ?1',
      })
    ).toThrow(/REPLACE/);
    expect(() =>
      defineStatement({
        ...base,
        sql: 'REPLACE INTO tags SELECT * FROM tags WHERE ws_id = ?1',
      })
    ).toThrow(/REPLACE/);
    expect(() =>
      defineStatement({
        ...base,
        sql: 'SELECT 1 FROM tags WHERE ws_id = ?1; DELETE FROM tags',
      })
    ).toThrow(/one statement/);
    expect(() => defineStatements([countTags, countTags])).toThrow(/Duplicate/);
  });

  it('binds ?1 to the scope workspace', async () => {
    const { client, fake } = setup({
      statements: defineStatements([countTags]),
    });
    const tags = await client.scope('tags', 'list', WS_A);
    await client.run(countTags, tags, { name: 'red' });
    expect(fake.executed[0]?.sql).toBe(countTags.sql);
    expect(fake.executed[0]?.parameters).toEqual([WS_A, 'red']);
  });

  it('refuses unregistered statements and mismatched or conditional scopes', async () => {
    const { client, fake } = setup({
      statements: defineStatements([countTags, updateNoteTitles]),
    });
    const tags = await client.scope('tags', 'list', WS_A);
    const tagUpdate = await client.scope('tags', 'update', WS_A);
    const noteUpdate = await client.scope('notes', 'update', WS_A);
    const other = defineStatement({ ...countTags, name: 'tags.other' });
    await expect(client.run(other, tags, { name: 'x' })).rejects.toThrow(
      /Unregistered statement/
    );
    await expect(
      client.run(countTags, tagUpdate, { name: 'x' })
    ).rejects.toThrow(/needs a list scope/);
    // notes.update is an owner rule, which raw SQL cannot carry.
    await expect(
      client.run(updateNoteTitles, noteUpdate, undefined)
    ).rejects.toThrow(/unconditional scope/);
    const foreign = await setup().client.scope('tags', 'list', WS_A);
    await expect(client.run(countTags, foreign, { name: 'x' })).rejects.toThrow(
      /not minted/
    );
    expect(fake.executed).toHaveLength(0);
  });
});

import { type Kysely, sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { DataError } from './errors';
import type { Scoped } from './scoped';
import { setup, USER, WS_A, WS_B, WS_OUTSIDE } from './test-support/fixture';

// Brands a query without scoping it, to prove the runtime guard alone refuses.
const forge = <Q>(query: Q) => query as Scoped<Q>;

const refused = async (promise: Promise<unknown>, message: RegExp = /./) => {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(DataError);
  expect((error as DataError).code).toBe('refused');
  expect((error as DataError).message).toMatch(message);
};

describe('scoped selects', () => {
  it('adds ws_id and the policy predicate as a top-level AND', async () => {
    const { client, fake } = setup();
    const notes = await client.scope('notes', 'list', WS_A);
    const query = client.builder.selectFrom('notes').select(['id', 'title']);
    await client.execute(client.scoped(query, notes));
    expect(fake.executed).toHaveLength(1);
    const [compiled] = fake.executed;
    expect(compiled?.sql).toBe(
      'select "id", "title" from "notes" where ("notes"."ws_id" = ? and 1 = 1)'
    );
    expect(compiled?.parameters).toEqual([WS_A]);
  });

  it('compiles an owner rule into the predicate', async () => {
    const { client, fake } = setup();
    const notes = await client.scope('notes', 'update', WS_A);
    const query = client.builder.updateTable('notes').set({ title: 'x' });
    await client.execute(client.scoped(query, notes));
    expect(fake.executed[0]?.sql).toBe(
      'update "notes" set "title" = ? where ("notes"."ws_id" = ? and "notes"."creator_id" = ?)'
    );
    expect(fake.executed[0]?.parameters).toEqual(['x', WS_A, USER]);
  });

  it('turns an engine deny into not_found without touching the database', async () => {
    const { client, fake } = setup();
    await expect(
      client.scope('notes', 'list', WS_OUTSIDE)
    ).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(fake.executed).toHaveLength(0);
  });

  it('refuses an unscoped tenant table at execute, compile and direct execute', async () => {
    const { client, fake } = setup();
    const query = client.builder.selectFrom('notes').selectAll();
    await refused(client.execute(forge(query)));
    expect(() => query.compile()).toThrow(DataError);
    await refused(query.execute());
    expect(fake.executed).toHaveLength(0);
  });

  it('refuses a hand-written ws_id filter', async () => {
    const { client } = setup();
    const query = client.builder
      .selectFrom('notes')
      .selectAll()
      .where('ws_id', '=', WS_A);
    await refused(client.execute(forge(query)));
  });

  it('refuses a scope that is not a top-level AND', async () => {
    const { client } = setup();
    const notes = await client.scope('notes', 'list', WS_A);
    const query = client.builder
      .selectFrom('notes')
      .selectAll()
      .where((eb) => eb.or([notes, eb('title', '=', 'x')]));
    await refused(client.execute(forge(query)));
  });

  it('refuses a scope minted by another client', async () => {
    const one = setup();
    const two = setup();
    const notes = await one.client.scope('notes', 'list', WS_A);
    const query = two.client.builder.selectFrom('notes').selectAll();
    expect(() => two.client.scoped(query, notes)).toThrow(DataError);
    await refused(two.client.execute(forge(query.where(notes))));
  });

  it('refuses a scope removed after scoping', async () => {
    const { client } = setup();
    const notes = await client.scope('notes', 'list', WS_A);
    const scoped = client.scoped(
      client.builder.selectFrom('notes').selectAll(),
      notes
    );
    await refused(client.execute(forge(scoped.clearWhere())));
  });

  it('binds scopes to aliases', async () => {
    const { client } = setup();
    const notes = await client.scope('notes', 'list', WS_A);
    const aliased = client.builder.selectFrom('notes as n').selectAll();
    await refused(
      client.execute(forge(aliased.where(notes))),
      /Unscoped tenant table: n$/
    );
    await client.execute(client.scoped(aliased, notes.as('n')));
  });

  it('refuses a read scope on a write and a write scope on a read', async () => {
    const { client } = setup();
    const list = await client.scope('notes', 'list', WS_A);
    const update = await client.scope('notes', 'update', WS_A);
    await refused(
      client.execute(
        forge(
          client.builder.updateTable('notes').set({ title: 'x' }).where(list)
        )
      )
    );
    await refused(
      client.execute(forge(client.builder.deleteFrom('notes').where(update)))
    );
    await refused(
      client.execute(
        forge(client.builder.selectFrom('notes').selectAll().where(update))
      )
    );
    const remove = await client.scope('notes', 'delete', WS_A);
    await client.execute(
      client.scoped(client.builder.deleteFrom('notes'), remove)
    );
  });

  it('refuses assigning ws_id in an update', async () => {
    const { client } = setup();
    const update = await client.scope('tags', 'update', WS_A);
    const query = client.builder.updateTable('tags').set({ ws_id: WS_B });
    await refused(
      client.execute(client.scoped(query, update)),
      /ws_id may not be assigned/
    );
  });

  it('refuses one statement across two workspaces', async () => {
    const { client } = setup();
    const a = await client.scope('notes', 'list', WS_A);
    const b = await client.scope('tags', 'list', WS_B);
    const query = client.builder
      .selectFrom('notes')
      .innerJoin('tags', 'tags.note_id', 'notes.id')
      .selectAll();
    await refused(client.execute(client.scoped(query, a, b)), /one workspace/);
  });
});

describe('every table source is walked', () => {
  it('requires a scope on each join, in WHERE or in ON', async () => {
    const { client } = setup();
    const notes = await client.scope('notes', 'list', WS_A);
    const tags = await client.scope('tags', 'list', WS_A);
    const joined = client.builder
      .selectFrom('notes')
      .innerJoin('tags', 'tags.note_id', 'notes.id')
      .selectAll();
    await refused(
      client.execute(forge(joined.where(notes))),
      /Unscoped tenant table: tags/
    );
    await client.execute(client.scoped(joined, notes, tags));
    const onScoped = client.builder
      .selectFrom('notes')
      .leftJoin('tags', (join) =>
        join.onRef('tags.note_id', '=', 'notes.id').on(tags)
      )
      .selectAll();
    await client.execute(forge(onScoped.where(notes)));
  });

  it('requires a scope inside subqueries', async () => {
    const { client } = setup();
    const notes = await client.scope('notes', 'list', WS_A);
    const tags = await client.scope('tags', 'list', WS_A);
    const build = (scopeInner: boolean) =>
      client.builder
        .selectFrom('notes')
        .selectAll()
        .where('id', 'in', (eb) => {
          const inner = eb.selectFrom('tags').select('note_id');
          return scopeInner ? inner.where(tags) : inner;
        })
        .where(notes);
    await refused(client.execute(forge(build(false))));
    await client.execute(forge(build(true)));
    const inSelection = client.builder
      .selectFrom('notes')
      .select((eb) => eb.selectFrom('tags').select('name').limit(1).as('tag'))
      .where(notes);
    await refused(client.execute(forge(inSelection)));
  });

  it('requires a scope inside CTEs and set operations', async () => {
    const { client } = setup();
    const notes = await client.scope('notes', 'list', WS_A);
    const unscopedCte = client.builder
      .with('recent', (db) => db.selectFrom('notes').select('id'))
      .selectFrom('recent')
      .selectAll();
    await refused(client.execute(forge(unscopedCte)));
    const scopedCte = client.builder
      .with('recent', (db) => db.selectFrom('notes').select('id').where(notes))
      .selectFrom('recent')
      .selectAll();
    await client.execute(forge(scopedCte));
    const union = client.builder
      .selectFrom('notes')
      .select('id')
      .where(notes)
      .union(client.builder.selectFrom('tags').select('id'));
    await refused(client.execute(forge(union)));
  });

  it('refuses a CTE that shadows a registered table', async () => {
    const { client } = setup();
    const loose = client.builder as unknown as Kysely<
      Record<string, { code: string }>
    >;
    const query = loose
      .with('notes', (db) => db.selectFrom('countries').select('code'))
      .selectFrom('notes')
      .selectAll();
    await refused(client.execute(forge(query)), /CTE shadows a table: notes/);
  });
});

describe('table registry', () => {
  it('reads global tables without a scope and refuses writing them', async () => {
    const { client, fake } = setup();
    await client.execute(
      client.global(client.builder.selectFrom('countries').selectAll())
    );
    expect(fake.executed).toHaveLength(1);
    await refused(
      client.execute(forge(client.builder.deleteFrom('countries')))
    );
    await refused(
      client.execute(
        forge(client.builder.updateTable('countries').set({ name: 'x' }))
      )
    );
  });

  it('refuses system, unregistered and schema-qualified tables', async () => {
    const { client } = setup();
    await refused(
      client.execute(forge(client.builder.selectFrom('audit_log').selectAll())),
      /System table/
    );
    const unknown = client.builder
      .selectFrom('secrets' as 'countries')
      .selectAll();
    await refused(
      client.execute(forge(unknown)),
      /Unregistered table: secrets/
    );
    const schema = client.builder
      .selectFrom('main.countries' as 'countries')
      .selectAll();
    await refused(client.execute(forge(schema)), /Schema-qualified/);
  });

  it('refuses raw SQL fragments in builder queries', async () => {
    const { client } = setup();
    const notes = await client.scope('notes', 'list', WS_A);
    const query = client.builder
      .selectFrom('notes')
      .selectAll()
      .where(notes)
      .where(sql<boolean>`1 = 1 or ws_id is not null`);
    await refused(client.execute(forge(query)), /Raw SQL/);
    await refused(
      client.execute(
        forge(client.builder.selectFrom(sql`notes`.as('n')).selectAll())
      )
    );
  });
});

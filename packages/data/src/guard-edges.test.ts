import { describe, expect, it } from 'vitest';
import { DataError } from './errors';
import type { Scoped } from './scoped';
import { setup, WS_A, WS_B, WS_OUTSIDE } from './test-support/fixture';
import {
  FIXTURE_SCHEMA,
  openSqlite,
  sqliteDialect,
} from './test-support/sqlite';

const forge = <Q>(query: Q) => query as Scoped<Q>;

const refused = async (promise: Promise<unknown>, message: RegExp = /./) => {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(DataError);
  expect((error as DataError).code).toBe('refused');
  expect((error as DataError).message).toMatch(message);
};

const sqlite = await openSqlite();

describe('joins that preserve the joined input', () => {
  it('refuses RIGHT and FULL joins even when ON carries the scope', async () => {
    const { client } = setup();
    const notes = await client.scope('notes', 'list', WS_A);
    const from = client.builder.selectFrom('countries');
    const right = from
      .rightJoin('notes', (join) =>
        join.onRef('notes.id', '=', 'countries.code').on(notes)
      )
      .selectAll();
    const full = from
      .fullJoin('notes', (join) =>
        join.onRef('notes.id', '=', 'countries.code').on(notes)
      )
      .selectAll();
    await refused(client.execute(forge(right)), /RightJoin/);
    await refused(client.execute(forge(full)), /FullJoin/);
  });

  it('refuses RIGHT and FULL joins even with the scope in WHERE', async () => {
    const { client } = setup();
    const notes = await client.scope('notes', 'list', WS_A);
    const query = client.builder
      .selectFrom('countries')
      .rightJoin('notes', 'notes.id', 'countries.code')
      .selectAll()
      .where(notes);
    await refused(client.execute(forge(query)), /join/i);
  });

  it('refuses a join type it does not know', async () => {
    const { client } = setup();
    const notes = await client.scope('notes', 'list', WS_A);
    const query = client.builder
      .selectFrom('countries')
      .crossApply((eb) =>
        eb.selectFrom('notes').selectAll().where(notes).as('n')
      )
      .selectAll();
    await refused(client.execute(forge(query)), /join/i);
  });

  it.skipIf(!sqlite)(
    'never returns rows of another workspace through an outer join',
    async () => {
      sqlite!.exec(FIXTURE_SCHEMA);
      sqlite!.exec(`
        insert into countries values ('vn', 'Viet Nam');
        insert into notes values ('vn', '${WS_A}', 'mine', 'u');
        insert into notes values ('x', '${WS_OUTSIDE}', 'theirs', 'u');
      `);
      const { client } = setup({ dialect: sqliteDialect(sqlite!) });
      const notes = await client.scope('notes', 'list', WS_A);
      const right = client.builder
        .selectFrom('countries')
        .rightJoin('notes', (join) =>
          join.onRef('notes.id', '=', 'countries.code').on(notes)
        )
        .select(['notes.id', 'notes.ws_id']);
      await refused(client.execute(forge(right)), /join/i);
      const left = client.builder
        .selectFrom('countries')
        .leftJoin('notes', (join) =>
          join.onRef('notes.id', '=', 'countries.code').on(notes)
        )
        .select(['countries.code', 'notes.ws_id']);
      const { rows } = await client.execute(client.global(left as never));
      expect(rows).toEqual([{ code: 'vn', ws_id: WS_A }]);
    }
  );
});

describe('ws_id is matched case-insensitively', () => {
  for (const column of ['WS_ID', 'Ws_Id', 'ws_ID']) {
    it(`refuses UPDATE SET ${column}`, async () => {
      const { client } = setup();
      const update = await client.scope('tags', 'update', WS_A);
      const query = client.builder
        .updateTable('tags')
        .set({ [column]: WS_B } as never);
      await refused(client.execute(client.scoped(query, update)), /ws_id/);
      const qualified = client.builder
        .updateTable('tags')
        .set(`tags.${column}` as never, WS_B as never);
      await refused(client.execute(client.scoped(qualified, update)), /ws_id/);
    });

    it(`refuses DO UPDATE SET ${column}`, async () => {
      const { client } = setup();
      const update = await client.scope('tags', 'update', WS_A);
      const query = await client.insertInto(
        'tags',
        WS_A,
        [{ id: 't', note_id: 'n', name: 'x' }],
        (q) =>
          q.onConflict((oc) =>
            oc
              .columns(['ws_id', 'id'])
              .doUpdateSet({ [column]: WS_B } as never)
              .where(update)
          )
      );
      await refused(client.execute(query), /ws_id/);
    });

    it(`treats a payload ${column} as the workspace column`, async () => {
      const { client, fake } = setup();
      await expect(
        client.insertInto('tags', WS_A, [
          { id: 't', note_id: 'n', name: 'x', [column]: WS_B } as never,
        ])
      ).rejects.toMatchObject({ code: 'not_found' });
      await client.execute(
        await client.insertInto('tags', WS_A, [
          { id: 't', note_id: 'n', name: 'x', [column]: WS_A } as never,
        ])
      );
      expect(fake.executed[0]?.sql).toBe(
        'insert into "tags" ("id", "note_id", "name", "ws_id") values (?, ?, ?, ?)'
      );
    });
  }

  it.skipIf(!sqlite)('cannot move a row with a quoted WS_ID', async () => {
    sqlite!.exec(
      FIXTURE_SCHEMA.replaceAll('create table', 'create table if not exists')
    );
    sqlite!.exec(`insert into tags values ('t9', '${WS_A}', 'n', 'x')`);
    const { client } = setup({ dialect: sqliteDialect(sqlite!) });
    const update = await client.scope('tags', 'update', WS_A);
    const query = client.builder
      .updateTable('tags')
      .set({ WS_ID: WS_B } as never)
      .where('id', '=', 't9');
    await refused(client.execute(client.scoped(query, update)), /ws_id/);
    const row = sqlite!.prepare("select ws_id from tags where id = 't9'").all();
    expect(row).toEqual([{ ws_id: WS_A }]);
  });

  it('resolves table and CTE names in any letter case', async () => {
    const { client } = setup();
    const notes = await client.scope('notes', 'list', WS_A);
    const upper = client.builder.selectFrom('NOTES' as 'notes').selectAll();
    await refused(client.execute(forge(upper)), /Unscoped tenant table: notes/);
    await client.execute(forge(upper.where(notes)));
    const loose = client.builder as unknown as import('kysely').Kysely<
      Record<string, { code: string }>
    >;
    const shadow = loose
      .with('Notes', (db) => db.selectFrom('countries').select('code'))
      .selectFrom('countries')
      .selectAll();
    await refused(client.execute(forge(shadow)), /CTE shadows a table/);
  });
});

describe('UPDATE … FROM, RETURNING and DELETE … USING', () => {
  it('requires a scope on UPDATE … FROM sources', async () => {
    const { client } = setup();
    const update = await client.scope('notes', 'update', WS_A);
    const tags = await client.scope('tags', 'list', WS_A);
    const base = client.builder
      .updateTable('notes')
      .from('tags')
      .set({ title: 'x' })
      .whereRef('tags.note_id', '=', 'notes.id');
    await refused(client.execute(forge(base.where(update))), /tags/);
    await client.execute(forge(base.where(update).where(tags)));
  });

  it('requires a scope on subqueries in RETURNING', async () => {
    const { client } = setup();
    const update = await client.scope('notes', 'update', WS_A);
    const tags = await client.scope('tags', 'list', WS_A);
    const returning = (scoped: boolean) =>
      client.builder
        .updateTable('notes')
        .set({ title: 'x' })
        .where(update)
        .returning((eb) => {
          const inner = eb.selectFrom('tags').select('name').limit(1);
          return (scoped ? inner.where(tags) : inner).as('tag');
        });
    await refused(client.execute(forge(returning(false))), /tags/);
    await client.execute(forge(returning(true)));
  });

  it('requires a scope on DELETE … USING sources', async () => {
    const { client } = setup();
    const remove = await client.scope('notes', 'delete', WS_A);
    const tags = await client.scope('tags', 'list', WS_A);
    const base = client.builder
      .deleteFrom('notes')
      .using('tags')
      .whereRef('tags.note_id', '=', 'notes.id')
      .where(remove);
    await refused(client.execute(forge(base)), /tags/);
    await client.execute(forge(base.where(tags)));
  });

  it('refuses an unscoped scalar subquery under a global outer table', async () => {
    const { client } = setup();
    const query = client.builder
      .selectFrom('countries')
      .select((eb) =>
        eb.selectFrom('notes').select('title').limit(1).as('title')
      );
    // The type-level check sees only the outer table; the runtime walk
    // is what refuses the subquery.
    await refused(client.execute(client.global(query)), /notes/);
  });
});

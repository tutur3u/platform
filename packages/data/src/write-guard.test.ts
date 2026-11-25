import { describe, expect, it } from 'vitest';
import { DataError } from './errors';
import type { Scoped } from './scoped';
import { setup, WS_A, WS_B, WS_OUTSIDE } from './test-support/fixture';

const forge = <Q>(query: Q) => query as Scoped<Q>;

const refused = async (promise: Promise<unknown>, message: RegExp = /./) => {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(DataError);
  expect((error as DataError).code).toBe('refused');
  expect((error as DataError).message).toMatch(message);
};

const tag = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  note_id: 'n1',
  name: 'red',
  ...over,
});

describe('inserts', () => {
  it('takes ws_id from the resource', async () => {
    const { client, fake } = setup();
    await client.execute(await client.insertInto('tags', WS_A, [tag()]));
    expect(fake.executed[0]?.sql).toBe(
      'insert into "tags" ("id", "note_id", "name", "ws_id") values (?, ?, ?, ?)'
    );
    expect(fake.executed[0]?.parameters).toEqual(['t1', 'n1', 'red', WS_A]);
  });

  it('treats a payload ws_id for another workspace as not found', async () => {
    const { client, fake } = setup();
    await expect(
      client.insertInto('tags', WS_A, [
        tag({ ws_id: WS_A }),
        tag({ ws_id: WS_B }),
      ])
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(fake.executed).toHaveLength(0);
  });

  it('authorizes create for every row', async () => {
    const { client } = setup();
    await expect(
      client.insertInto('tags', WS_OUTSIDE, [tag()])
    ).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('refuses inserts not built by insertInto', async () => {
    const { client } = setup();
    const raw = client.builder
      .insertInto('tags')
      .values({ ...tag(), ws_id: WS_A });
    await refused(client.execute(forge(raw)), /built by DataClient.insertInto/);
    const approved = await client.insertInto('tags', WS_A, [tag()]);
    await refused(
      client.execute(forge(approved.values({ ...tag(), ws_id: WS_B })))
    );
    await refused(
      client.execute(
        forge(
          approved
            .columns(['id'])
            .expression((eb) => eb.selectFrom('countries').select('code'))
        )
      )
    );
  });

  it('refuses inserts into non-tenant tables', async () => {
    const { client } = setup();
    await expect(
      client.insertInto('countries' as 'tags', WS_A, [tag()])
    ).rejects.toMatchObject({
      code: 'refused',
    });
    const raw = client.builder
      .insertInto('audit_log')
      .values({ id: 'a', body: 'b' });
    await refused(client.execute(forge(raw)));
  });

  it('refuses INSERT OR REPLACE and other conflict actions', async () => {
    const { client } = setup();
    await refused(
      client.execute(
        await client.insertInto('tags', WS_A, [tag()], (q) => q.orReplace())
      ),
      /REPLACE/
    );
    await refused(
      client.execute(
        await client.insertInto('tags', WS_A, [tag()], (q) => q.orIgnore())
      ),
      /REPLACE/
    );
  });
});

describe('upserts', () => {
  it('accepts a conflict target that includes ws_id with the update scope', async () => {
    const { client, fake } = setup();
    const update = await client.scope('tags', 'update', WS_A);
    const query = await client.insertInto('tags', WS_A, [tag()], (q) =>
      q.onConflict((oc) =>
        oc.columns(['ws_id', 'id']).doUpdateSet({ name: 'blue' }).where(update)
      )
    );
    await client.execute(query);
    expect(fake.executed[0]?.sql).toContain(
      'on conflict ("ws_id", "id") do update set "name" = ? where'
    );
  });

  it('accepts target.ws_id = excluded.ws_id instead of a ws_id target', async () => {
    const { client } = setup();
    const update = await client.scope('tags', 'update', WS_A);
    const query = await client.insertInto('tags', WS_A, [tag()], (q) =>
      q.onConflict((oc) =>
        oc
          .column('id')
          .doUpdateSet({ name: 'blue' })
          .where((eb) =>
            eb(eb.ref('tags.ws_id'), '=', eb.ref('excluded.ws_id'))
          )
          .where(update)
      )
    );
    await client.execute(query);
  });

  it('refuses any other conflict target', async () => {
    const { client } = setup();
    const update = await client.scope('tags', 'update', WS_A);
    const byId = await client.insertInto('tags', WS_A, [tag()], (q) =>
      q.onConflict((oc) =>
        oc.column('id').doUpdateSet({ name: 'blue' }).where(update)
      )
    );
    await refused(client.execute(byId), /excluded\.ws_id/);
    const byConstraint = await client.insertInto('tags', WS_A, [tag()], (q) =>
      q.onConflict((oc) =>
        oc.constraint('tags_pkey').doUpdateSet({ name: 'blue' }).where(update)
      )
    );
    await refused(client.execute(byConstraint), /name their conflict columns/);
  });

  it('requires the update scope on DO UPDATE', async () => {
    const { client } = setup();
    const list = await client.scope('tags', 'list', WS_A);
    const unscoped = await client.insertInto('tags', WS_A, [tag()], (q) =>
      q.onConflict((oc) =>
        oc.columns(['ws_id', 'id']).doUpdateSet({ name: 'blue' })
      )
    );
    await refused(client.execute(unscoped), /update scope/);
    const wrongAction = await client.insertInto('tags', WS_A, [tag()], (q) =>
      q.onConflict((oc) =>
        oc.columns(['ws_id', 'id']).doUpdateSet({ name: 'blue' }).where(list)
      )
    );
    await refused(client.execute(wrongAction), /update scope/);
  });

  it('refuses DO UPDATE that sets ws_id', async () => {
    const { client } = setup();
    const update = await client.scope('tags', 'update', WS_A);
    const query = await client.insertInto('tags', WS_A, [tag()], (q) =>
      q.onConflict((oc) =>
        oc.columns(['ws_id', 'id']).doUpdateSet({ ws_id: WS_B }).where(update)
      )
    );
    await refused(client.execute(query), /ws_id may not be assigned/);
  });

  it('requires ws_id in a DO NOTHING target', async () => {
    const { client } = setup();
    await refused(
      client.execute(
        await client.insertInto('tags', WS_A, [tag()], (q) =>
          q.onConflict((oc) => oc.column('id').doNothing())
        )
      )
    );
    await refused(
      client.execute(
        await client.insertInto('tags', WS_A, [tag()], (q) =>
          q.onConflict((oc) => oc.doNothing())
        )
      )
    );
    await client.execute(
      await client.insertInto('tags', WS_A, [tag()], (q) =>
        q.onConflict((oc) => oc.columns(['ws_id', 'id']).doNothing())
      )
    );
  });

  it('refuses an update scope for another workspace', async () => {
    const { client } = setup();
    const other = await client.scope('tags', 'update', WS_B);
    const query = await client.insertInto('tags', WS_A, [tag()], (q) =>
      q.onConflict((oc) =>
        oc.columns(['ws_id', 'id']).doUpdateSet({ name: 'blue' }).where(other)
      )
    );
    await refused(client.execute(query), /one workspace/);
  });
});

// Type-level tests for Scoped<Q>. The bodies below are checked by
// `tsc --noEmit` (the package type-check) and never run: each
// `@ts-expect-error` fails the type-check if the line it guards compiles.

import { describe, expect, it } from 'vitest';
import { type DataClient, forPrincipal } from './client';
import { defineTables } from './registry';
import {
  type FixtureDB,
  principal,
  type setup,
  type tables,
} from './test-support/fixture';

type Client = DataClient<FixtureDB, (typeof tables)['specs']>;

const typeOnly = (_check: (client: Client) => Promise<void>) => true;

describe('Scoped<Q> type checks', () => {
  it('accepts covered queries and rejects uncovered ones', () => {
    expect(
      typeOnly(async (client) => {
        const notes = await client.scope('notes', 'list', 'ws');
        const tags = await client.scope('tags', 'list', 'ws');
        const select = client.builder.selectFrom('notes').selectAll();

        await client.execute(client.scoped(select, notes));
        await client.execute(
          client.global(client.builder.selectFrom('countries').selectAll())
        );
        await client.execute(
          client.scoped(
            client.builder
              .selectFrom('notes')
              .innerJoin('countries', 'countries.code', 'notes.id')
              .selectAll(),
            notes
          )
        );

        // @ts-expect-error an unbranded builder cannot execute
        await client.execute(select);
        // @ts-expect-error the scope covers another table
        await client.execute(client.scoped(select, tags));
        const joined = client.builder
          .selectFrom('notes')
          .innerJoin('tags', 'tags.note_id', 'notes.id')
          .selectAll();
        const joinMissingScope = client.scoped(joined, notes);
        // @ts-expect-error the joined tenant table has no scope
        await client.execute(joinMissingScope);
        const aliased = client.builder.selectFrom('notes as n').selectAll();
        const aliasMissingScope = client.scoped(aliased, notes);
        // @ts-expect-error an aliased table needs a scope with that alias
        await client.execute(aliasMissingScope);
        await client.execute(client.scoped(aliased, notes.as('n')));
        // @ts-expect-error global() does not cover tenant tables
        await client.execute(client.global(select));
        // @ts-expect-error scoped() needs at least one scope
        client.scoped(select);
      })
    ).toBe(true);
  });

  it('covers writes and restricts tables by kind', () => {
    expect(
      typeOnly(async (client) => {
        const update = await client.scope('notes', 'update', 'ws');
        const list = await client.scope('notes', 'list', 'ws');
        const listForUpdate = client.scoped(
          client.builder.updateTable('notes').set({ title: 'x' }),
          list
        );
        // @ts-expect-error an update needs an update scope on its target
        await client.execute(listForUpdate);
        const updateForSelect = client.scoped(
          client.builder.selectFrom('notes').selectAll(),
          update
        );
        // @ts-expect-error a select needs a read or list scope
        await client.execute(updateForSelect);
        const remove = await client.scope('notes', 'delete', 'ws');
        await client.execute(
          client.scoped(client.builder.deleteFrom('notes'), remove)
        );
        await client.execute(
          client.scoped(
            client.builder.updateTable('notes').set({ title: 'x' }),
            update
          )
        );
        const globalDelete = client.global(
          client.builder.deleteFrom('countries')
        );
        // @ts-expect-error a write to a global table is never covered
        await client.execute(globalDelete);
        const unscopedUpdate = client.builder
          .updateTable('notes')
          .set({ title: 'x' });
        // @ts-expect-error an update needs a scope
        await client.execute(unscopedUpdate);

        await client.execute(
          await client.insertInto('tags', 'ws', [
            { id: 't', note_id: 'n', name: 'x' },
          ])
        );
        // @ts-expect-error inserts only target tenant tables
        await client.insertInto('countries', 'ws', [
          { code: 'vn', name: 'Viet Nam' },
        ]);
        // @ts-expect-error scopes only exist for tenant tables
        await client.scope('audit_log', 'read', 'ws');
      })
    ).toBe(true);
  });

  it('requires every table in the registry', () => {
    expect(
      typeOnly(async () => {
        defineTables<FixtureDB>()({
          notes: { kind: 'tenant' },
          tags: { kind: 'tenant' },
          countries: { kind: 'global-readonly' },
          audit_log: { kind: 'system' },
          // @ts-expect-error secrets is not a table of FixtureDB
          secrets: { kind: 'tenant' },
        });
        // @ts-expect-error audit_log is missing
        defineTables<FixtureDB>()({
          notes: { kind: 'tenant' },
          tags: { kind: 'tenant' },
          countries: { kind: 'global-readonly' },
        });
      })
    ).toBe(true);
  });

  it('requires an invocation budget', () => {
    const check = (fixture: ReturnType<typeof setup>) => {
      // @ts-expect-error the budget is required
      forPrincipal(fixture.engine, principal, fixture.database);
      // @ts-expect-error the budget is required
      forPrincipal(fixture.engine, principal, fixture.database, {});
    };
    expect(typeof check).toBe('function');
  });
});

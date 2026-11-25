// Shared fixture for the package tests: a notes domain with one table of each
// kind, an engine over the in-memory permission source and a fake dialect.

import {
  createEngine,
  type AuthzPrincipal,
  type Policy,
} from '@tuturuuu/authz';
import { InMemoryPermissionSource } from '@tuturuuu/authz/testing';
import type { Dialect } from 'kysely';
import { createInvocationBudget } from '../budget';
import { forPrincipal } from '../client';
import { defineDatabase } from '../database';
import { defineTables } from '../registry';
import type { StatementRegistry } from '../statements';
import { FakeDatabase } from '../testing';

export interface FixtureDB {
  notes: { id: string; ws_id: string; title: string; creator_id: string };
  tags: { id: string; ws_id: string; note_id: string; name: string };
  countries: { code: string; name: string };
  audit_log: { id: string; body: string };
}

export const tables = defineTables<FixtureDB>()({
  notes: { kind: 'tenant', resource: 'note' },
  tags: { kind: 'tenant' },
  countries: { kind: 'global-readonly' },
  audit_log: { kind: 'system' },
});

export const USER = 'user-1';
export const WS_A = 'ws-a';
export const WS_B = 'ws-b';
export const WS_OUTSIDE = 'ws-outside';
const NOW = Date.UTC(2026, 10, 24);

const policies: Policy[] = [
  {
    type: 'note',
    actions: {
      read: { kind: 'member' },
      list: { kind: 'member' },
      create: { kind: 'member' },
      update: { kind: 'owner', column: 'creator_id' },
      delete: { kind: 'permission', permission: 'manage_notes' },
    },
  },
  {
    type: 'tags',
    actions: {
      read: { kind: 'member' },
      list: { kind: 'member' },
      create: { kind: 'member' },
      update: { kind: 'member' },
      delete: { kind: 'member' },
    },
  },
];

export const principal: AuthzPrincipal = {
  kind: 'user',
  userId: USER,
  appId: 'notes',
  credential: {
    kind: 'identity',
    aal: 'aal1',
    amr: ['pwd'],
    authTime: NOW / 1000,
  },
  expiresAt: NOW / 1000 + 600,
};

export function setup(
  options: {
    statements?: StatementRegistry;
    batch?: boolean;
    dialect?: Dialect;
  } = {}
) {
  const source = new InMemoryPermissionSource();
  source.addUser(USER);
  for (const ws of [WS_A, WS_B, WS_OUTSIDE]) source.addWorkspace(ws);
  source.grant(USER, WS_A, ['manage_notes']);
  source.grant(USER, WS_B);
  const engine = createEngine({
    policies,
    source,
    knownPermissions: new Set(['manage_notes']),
    now: () => NOW,
  });
  const fake = new FakeDatabase();
  const database = defineDatabase({
    dialect: options.dialect ?? fake.dialect,
    tables,
    statements: options.statements,
    batch: options.batch === false ? undefined : fake.batch,
  });
  const budget = createInvocationBudget();
  const client = forPrincipal(engine, principal, database, { budget });
  return { engine, source, fake, database, client, budget };
}

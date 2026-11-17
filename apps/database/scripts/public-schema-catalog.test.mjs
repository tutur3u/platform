import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CATALOG_SQL,
  evaluatePublicSchemaCatalog,
  parseCatalogOutput,
} from './public-schema-catalog.mjs';

const allowlist = (overrides = {}) => ({
  version: 1,
  currentWave: 1,
  lintAfterVersion: '20261117063000',
  relations: {
    notes: { kind: 'table', wave: 5 },
    note_stats: { kind: 'view', wave: 5 },
  },
  moved: {},
  serviceRoleCompatViews: {},
  defaultAclExemptOwners: {},
  functions: { enforced: false, names: {} },
  ...overrides,
});

const relation = (name, extra = {}) => ({
  name,
  relkind: 'r',
  rls: true,
  grantees: ['postgres', 'service_role'],
  depends_on: [],
  owner: 'postgres',
  security_invoker: false,
  ...extra,
});

const catalog = (overrides = {}) => ({
  relations: [
    relation('notes'),
    relation('note_stats', { relkind: 'v', depends_on: ['public.notes'] }),
  ],
  functions: [{ signature: 'touch_updated_at()', owner: 'postgres' }],
  private_relations: ['secrets'],
  default_acl: [],
  ...overrides,
});

test('a catalog equal to the allowlist passes', () => {
  assert.deepEqual(evaluatePublicSchemaCatalog(catalog(), allowlist()), {
    errors: [],
    warnings: [],
  });
});

test('G1: unallowlisted, stale and mis-kinded relations fail', () => {
  const { errors } = evaluatePublicSchemaCatalog(
    catalog({
      relations: [relation('notes', { relkind: 'v' }), relation('fresh')],
    }),
    allowlist()
  );
  assert.match(
    errors.join('\n'),
    /public\.fresh exists but is not allowlisted/u
  );
  assert.match(errors.join('\n'), /relations\.note_stats is stale/u);
  assert.match(
    errors.join('\n'),
    /public\.notes is a view, allowlisted as table/u
  );
});

test('G1: retained relations may be absent from a replay but not present', () => {
  const retained = allowlist({
    relations: {
      ...allowlist().relations,
      hosted_only: { kind: 'table', wave: 6, retained: true },
    },
  });
  assert.deepEqual(evaluatePublicSchemaCatalog(catalog(), retained).errors, []);
  const created = catalog({
    relations: [...catalog().relations, relation('hosted_only')],
  });
  assert.match(
    evaluatePublicSchemaCatalog(created, retained).errors[0],
    /marked retained/u
  );
});

test('G1: moved relations must be in private and absent from public', () => {
  const moved = allowlist({
    moved: {
      secrets: { wave: 1, schema: 'private' },
      ghost: { wave: 1, schema: 'private' },
    },
  });
  const { errors } = evaluatePublicSchemaCatalog(catalog(), moved);
  assert.deepEqual(errors, ['moved.ghost does not exist in private']);
  const lingering = evaluatePublicSchemaCatalog(
    catalog({ relations: [...catalog().relations, relation('secrets')] }),
    moved
  );
  assert.match(
    lingering.errors.join('\n'),
    /moved\.secrets still exists in public/u
  );
});

test('G2: RLS-off tables fail, and client grants on them fail separately', () => {
  const { errors } = evaluatePublicSchemaCatalog(
    catalog({
      relations: [
        relation('notes', {
          rls: false,
          grantees: ['postgres', 'anon', 'authenticated'],
        }),
        relation('note_stats', {
          relkind: 'v',
          rls: false,
          grantees: ['authenticated'],
          security_invoker: true,
        }),
      ],
    }),
    allowlist()
  );
  assert.deepEqual(errors, [
    'public.notes has row level security disabled',
    'public.notes grants anon, authenticated without row level security',
  ]);
});

test('G2: client default privileges fail; authenticated EXECUTE warns until enforced', () => {
  const row = (objtype, grantee, scope = 'public') => ({
    owner: 'postgres',
    scope,
    objtype,
    grants: [{ grantee, privilege: objtype === 'f' ? 'EXECUTE' : 'SELECT' }],
  });
  const result = evaluatePublicSchemaCatalog(
    catalog({
      default_acl: [
        row('r', 'anon'),
        row('S', 'PUBLIC', 'global'),
        row('f', 'anon'),
        row('f', 'authenticated'),
        row('r', 'service_role'),
      ],
    }),
    allowlist()
  );
  assert.equal(result.errors.length, 3);
  assert.match(
    result.errors[0],
    /public default ACL for postgres \(objtype r\) grants anon/u
  );
  assert.match(result.errors[1], /global default ACL/u);
  assert.match(result.errors[2], /grants EXECUTE to anon/u);
  assert.equal(result.warnings.length, 1);
  const enforced = evaluatePublicSchemaCatalog(
    catalog({ default_acl: [row('f', 'authenticated')] }),
    allowlist({ functions: { enforced: true, names: {} } })
  );
  assert.equal(enforced.errors.length, 1);
});

test('G2: exempt default ACL owners warn instead of failing', () => {
  const doc = catalog({
    default_acl: [
      {
        owner: 'supabase_admin',
        scope: 'public',
        objtype: 'r',
        grants: [{ grantee: 'anon', privilege: 'SELECT' }],
      },
    ],
  });
  assert.equal(evaluatePublicSchemaCatalog(doc, allowlist()).errors.length, 1);
  const exempt = allowlist({
    defaultAclExemptOwners: { supabase_admin: { reason: 'platform' } },
  });
  const result = evaluatePublicSchemaCatalog(doc, exempt);
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings[0], /exempt owner/u);
});

test('F1: objects owned by an exempt owner need a platformObjects record', () => {
  const exempt = {
    defaultAclExemptOwners: { supabase_admin: { reason: 'platform' } },
  };
  const doc = catalog({
    relations: [
      ...catalog().relations,
      relation('pg_stat_helper', { owner: 'supabase_admin' }),
    ],
    functions: [{ signature: 'graphql(text, jsonb)', owner: 'supabase_admin' }],
  });
  const strict = evaluatePublicSchemaCatalog(
    doc,
    allowlist({
      ...exempt,
      relations: {
        ...allowlist().relations,
        pg_stat_helper: { kind: 'table', wave: 8 },
      },
    })
  );
  assert.deepEqual(strict.errors, [
    'relation:pg_stat_helper is owned by exempt owner supabase_admin; record it under platformObjects with a reason or change its owner',
    'function:graphql(text, jsonb) is owned by exempt owner supabase_admin; record it under platformObjects with a reason or change its owner',
  ]);
  const recorded = evaluatePublicSchemaCatalog(
    doc,
    allowlist({
      ...exempt,
      relations: {
        ...allowlist().relations,
        pg_stat_helper: { kind: 'table', wave: 8 },
      },
      platformObjects: {
        'relation:pg_stat_helper': { reason: 'platform' },
        'function:graphql(text, jsonb)': { reason: 'platform' },
      },
    })
  );
  assert.deepEqual(recorded.errors, []);
  const stale = evaluatePublicSchemaCatalog(
    catalog(),
    allowlist({
      ...exempt,
      platformObjects: { 'function:gone()': { reason: 'x' } },
    })
  );
  assert.match(stale.errors[0], /platformObjects\.function:gone\(\) is stale/u);
});

test('F2: client-granted views must be security_invoker or a reasoned exception', () => {
  const view = (extra) =>
    catalog({
      relations: [
        relation('notes'),
        relation('note_stats', {
          relkind: 'v',
          grantees: ['authenticated'],
          depends_on: ['public.notes'],
          ...extra,
        }),
      ],
    });
  assert.match(
    evaluatePublicSchemaCatalog(view({}), allowlist()).errors[0],
    /note_stats is a view granted to authenticated without security_invoker=true/u
  );
  assert.deepEqual(
    evaluatePublicSchemaCatalog(view({ security_invoker: true }), allowlist())
      .errors,
    []
  );
  const excepted = allowlist({
    clientViewExceptions: { note_stats: { reason: 'aggregate only' } },
  });
  assert.deepEqual(evaluatePublicSchemaCatalog(view({}), excepted).errors, []);
  assert.match(
    evaluatePublicSchemaCatalog(view({ security_invoker: true }), excepted)
      .errors[0],
    /clientViewExceptions\.note_stats is stale/u
  );
});

test('G5: compat views must exist, stay service-role only, read only their target and expire', () => {
  const compat = allowlist({
    serviceRoleCompatViews: {
      tasks: { expiresAfterWave: 2, target: 'private.tasks' },
    },
  });
  const good = catalog({
    relations: [
      ...catalog().relations,
      relation('tasks', { relkind: 'v', depends_on: ['private.tasks'] }),
    ],
  });
  assert.deepEqual(evaluatePublicSchemaCatalog(good, compat).errors, []);
  assert.deepEqual(evaluatePublicSchemaCatalog(catalog(), compat).errors, [
    'serviceRoleCompatViews.tasks does not exist in public',
  ]);
  const leaky = catalog({
    relations: [
      ...catalog().relations,
      relation('tasks', {
        relkind: 'v',
        grantees: ['authenticated'],
        depends_on: ['private.tasks', 'public.notes'],
      }),
    ],
  });
  assert.deepEqual(evaluatePublicSchemaCatalog(leaky, compat).errors, [
    'serviceRoleCompatViews.tasks grants authenticated',
    'serviceRoleCompatViews.tasks must read only private.tasks',
  ]);
  assert.match(
    evaluatePublicSchemaCatalog(good, { ...compat, currentWave: 3 }).errors[0],
    /expired after wave 2/u
  );
});

test('catalog output parsing and SQL shape fail closed', () => {
  const doc = {
    relations: [],
    functions: [],
    private_relations: [],
    default_acl: [],
  };
  assert.deepEqual(
    parseCatalogOutput(`BEGIN\nSET\n${JSON.stringify(doc)}\nROLLBACK\n`),
    doc
  );
  assert.throws(
    () => parseCatalogOutput('BEGIN\nROLLBACK\n'),
    /no JSON document/u
  );
  assert.throws(
    () => parseCatalogOutput('{"relations":[]}'),
    /lacks functions/u
  );
  assert.match(CATALOG_SQL, /^begin read only;/u);
  assert.match(CATALOG_SQL, /rollback;\s*$/u);
  assert.match(CATALOG_SQL, /deptype = 'e'/u);
});

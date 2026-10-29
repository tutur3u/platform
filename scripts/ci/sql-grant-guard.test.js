const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const {
  makeBaseline,
  baselineEntry,
  collectDiagnostics,
  validateBaseline,
} = require('./sql-grant-guard-baseline');
const {
  RULES,
  checkRepository,
  evaluateSqlFiles,
  formatLegacyReport,
  scanSql,
} = require('./sql-grant-guard');

const MIGRATION =
  'apps/database/supabase/migrations/20261101000000_example.sql';
const ROLLBACK = 'apps/database/rollbacks/20261101000000_example.rollback.sql';

function debt(entries) {
  return makeBaseline('a'.repeat(40), entries);
}
function evaluate(fixtures) {
  // Isolate the original rule fixtures with explicit debt for extension diagnostics.
  const input = {
    files: Object.keys(fixtures),
    readFile: (file) => fixtures[file],
  };
  const entries = collectDiagnostics(input)
    .filter(
      (finding) =>
        !Object.values(RULES).includes(finding.rule) ||
        /\/20261027/.test(finding.file)
    )
    .map(baselineEntry);
  return evaluateSqlFiles({ ...input, baseline: debt(entries) });
}

function grants(sql) {
  return scanSql(sql, { definerRule: false });
}

function definers(sql) {
  return scanSql(sql, { definerRule: true }).filter(
    (finding) => finding.rule === RULES.definerPublic
  );
}

test('the repository passes only exact diagnostic debt and retains the 13 original findings', () => {
  const result = checkRepository();
  assert.deepEqual(result.violations, []);
  const original = new Set(
    result.legacy.map((f) => `${path.basename(f.file)}:${f.line}:${f.rule}`)
  );
  for (const expected of [
    '20261029010000_restore_employee_readiness_path_contract.sql:3:definer-public',
    '20261029012000_harden_workspace_ownership_guard.sql:143:definer-public',
    '20261029012100_restrict_subscription_writes.sql:391:definer-public',
    '20261029012100_restrict_subscription_writes.sql:430:definer-public',
    '20261029012100_restrict_subscription_writes.sql:468:definer-public',
    '20261029012100_restrict_subscription_writes.sql:581:definer-public',
    '20261029030400_align_ai_chat_and_subscription_rpc_access.sql:45:definer-public',
    '20261029040800_finance_workspace_boundaries.sql:197:definer-public',
    '20261029040800_finance_workspace_boundaries.sql:267:definer-public',
    '20261029040800_finance_workspace_boundaries.sql:341:definer-public',
    '20261029040800_finance_workspace_boundaries.sql:415:definer-public',
    '20261029012300_tighten_legacy_table_grants.rollback.sql:2:anon-grant',
    '20261029030500_align_cross_app_token_grant_and_private_fence.rollback.sql:6:anon-grant',
  ])
    assert.ok(original.has(expected), expected);
});

test('the historical debt report counts every explicitly baselined diagnostic', () => {
  const { legacy } = checkRepository();
  assert.ok(legacy.length > 0);
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, 'sql-grant-guard.js'), '--report'],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    new RegExp(`explicitly baselined\\): ${legacy.length}\\n`)
  );
  assert.match(result.stdout, /anon-grant: \d+ in \d+ files/);
  assert.match(result.stdout, /definer-public: \d+ in \d+ files/);
});

test('a rollback re-granting EXECUTE to public and service_role fails', () => {
  const { violations } = evaluate({
    [ROLLBACK]: [
      '-- Restore the previous grants.',
      'grant execute on function public.get_user_sessions(uuid) to public, service_role;',
    ].join('\n'),
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, RULES.anonGrant);
  assert.match(violations[0].message, /rollback\.sql:2 grants to public\./);
});

test('a rollback re-granting EXECUTE to anon and authenticated fails', () => {
  const { violations } = evaluate({
    [ROLLBACK]:
      'GRANT EXECUTE ON FUNCTION public.list_finance_rows(uuid, text) TO anon, authenticated;\n',
  });
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /grants to anon\./);
});

test('table, view and multi-line grants are matched case-insensitively', () => {
  const findings = grants(
    [
      'create table public.example (id uuid);',
      'Grant SELECT, insert',
      '  ON TABLE public.example',
      '  TO "anon";',
      'grant select on public.example_view to Public with grant option;',
      'grant usage on schema public to authenticated;',
    ].join('\n')
  );
  assert.deepEqual(
    findings.map((finding) => [finding.line, finding.detail]),
    [
      [2, 'grants to anon'],
      [5, 'grants to public'],
    ]
  );
});

test('grants to authenticated or service_role on public objects pass', () => {
  assert.deepEqual(
    grants(
      [
        'grant execute on function public.f(uuid) to authenticated, service_role;',
        'grant select on table public.anon_events to service_role;',
        'revoke all on function public.f(uuid) from public, anon;',
        'alter default privileges in schema public revoke execute on functions from anon;',
      ].join('\n')
    ),
    []
  );
});

test('alter default privileges granting to anon or public fails', () => {
  const findings = grants(
    [
      'alter default privileges in schema public',
      '  grant execute on functions to anon;',
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON TABLES TO PUBLIC;',
    ].join('\n')
  );
  assert.deepEqual(
    findings.map((finding) => finding.line),
    [1, 3]
  );
});

test('allow-anon-grant exempts on the same or preceding line with a reason', () => {
  const sql = [
    'grant select on public.a to anon; -- allow-anon-grant: public catalog',
    '-- allow-anon-grant: health probe reads it',
    'grant select on public.b to anon;',
    '-- allow-anon-grant: too far away',
    '',
    'grant select on public.c to anon;',
    '-- allow-anon-grant:',
    'grant select on public.d to anon;',
    'grant select',
    '  on public.e',
    '  to anon; -- allow-anon-grant: multi-line statement',
  ].join('\n');
  assert.deepEqual(
    grants(sql).map((finding) => finding.line),
    [6, 8]
  );
});

test('GRANT text in comments, literals and dollar-quoted bodies is ignored', () => {
  const sql = [
    '-- grant execute on function public.f() to anon;',
    '/* grant select on public.t to public; /* nested */ still a comment',
    '   grant select on public.t to anon; */',
    "comment on table public.t is 'grant select on public.t to anon; see docs';",
    "select E'it\\'s fine; grant select on public.t to anon';",
    'do $$',
    'begin',
    "  execute 'grant select on public.t to anon';",
    '  grant select on public.t to public;',
    'end;',
    '$$;',
    'create function public.g() returns void language plpgsql as $body$',
    'begin',
    '  grant select on public.t to anon;',
    'end;',
    '$body$;',
    'revoke all on function public.g() from public, anon;',
  ].join('\n');
  assert.deepEqual(grants(sql), []);
});

test('a SECURITY DEFINER function without a revoke fails', () => {
  const { violations } = evaluate({
    [MIGRATION]: [
      'create or replace function public.get_workspace_secret(p_ws_id uuid)',
      'returns text',
      'language plpgsql',
      'security definer',
      "set search_path = ''",
      'as $$',
      'begin',
      '  return (select value from public.workspace_secrets where ws_id = p_ws_id);',
      'end;',
      '$$;',
      'grant execute on function public.get_workspace_secret(uuid) to authenticated;',
    ].join('\n'),
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, RULES.definerPublic);
  assert.match(
    violations[0].message,
    /:1 creates SECURITY DEFINER function public\.get_workspace_secret\(uuid\) without revoking EXECUTE from public, anon\./
  );
});

test('a matching revoke from public and anon satisfies the definer rule', () => {
  const sql = [
    'CREATE FUNCTION "public"."f"(p_ws_id uuid, p_limit int DEFAULT 10, OUT total bigint)',
    'RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$ select 1::bigint $$;',
    'REVOKE ALL ON FUNCTION public.f(uuid, integer) FROM PUBLIC;',
    'revoke execute on function public.f(uuid, int4) from anon;',
    'create function g(at timestamptz, ratio double precision) returns void',
    '  language sql security definer as $$ select $$;',
    'revoke all on function public.g(timestamp with time zone, float8), public.h(uuid) from public, anon;',
  ].join('\n');
  assert.deepEqual(definers(sql), []);
});

test('a revoke from public only, or for another signature, still fails', () => {
  const sql = [
    'create function public.f(p uuid) returns void language sql security definer as $$ select $$;',
    'revoke all on function public.f(uuid) from public;',
    'create function public.g(p uuid) returns void language sql security definer as $$ select $$;',
    'revoke all on function public.g(text) from public, anon;',
  ].join('\n');
  assert.deepEqual(
    definers(sql).map((finding) => finding.detail),
    [
      'creates SECURITY DEFINER function public.f(uuid) without revoking EXECUTE from anon',
      'creates SECURITY DEFINER function public.g(uuid) without revoking EXECUTE from public, anon',
    ]
  );
});

test('allow-definer-public exempts a definer function', () => {
  const sql = [
    '-- allow-definer-public: login helper must run before sign-in',
    'create function public.f() returns void language sql security definer as $$ select $$;',
  ].join('\n');
  assert.deepEqual(definers(sql), []);
});

test('invoker functions and definer text in bodies or comments pass', () => {
  const sql = [
    '-- security definer',
    'create function public.f() returns void language plpgsql security invoker as $$',
    'begin',
    "  raise notice 'security definer';",
    'end;',
    '$$;',
    'create function public.g() returns text language sql as $$ select $q$security definer$q$ $$;',
  ].join('\n');
  assert.deepEqual(definers(sql), []);
});

test('the original definer-public rule applies to migrations; extensions cover rollbacks', () => {
  const definer =
    'create function public.f() returns void language sql security definer as $$ select $$;';
  const { violations } = evaluate({
    [MIGRATION]: definer,
    [ROLLBACK]: definer,
  });
  assert.deepEqual(
    violations.map((violation) => violation.file),
    [MIGRATION]
  );
});

test('explicit historical debt is reported while unbaselined files remain enforced', () => {
  const grant = 'grant select on public.t to anon;';
  const { violations, legacy } = evaluate({
    'apps/database/supabase/migrations/20261027235959_old.sql': grant,
    'apps/database/rollbacks/20261027140000_old.rollback.sql': grant,
    'apps/database/supabase/migrations/20261028000000_new.sql': grant,
    'apps/database/rollbacks/unversioned.sql': grant,
    'apps/database/supabase/seed.sql': grant,
  });
  assert.deepEqual(
    violations.map((violation) => violation.file),
    [
      'apps/database/supabase/migrations/20261028000000_new.sql',
      'apps/database/rollbacks/unversioned.sql',
    ]
  );
  assert.equal(legacy.length, 6);
  assert.equal(
    legacy.filter((f) => Object.values(RULES).includes(f.rule)).length,
    2
  );
  assert.match(
    formatLegacyReport(legacy),
    /explicitly baselined\): 6\n {2}anon-grant: 2 in 2 files\n {2}definer-public: 0 in 0 files/
  );
});

const { scanExtensions } = require('./sql-grant-guard');
const { digest } = require('./sql-grant-guard-repository');
const createP2 = (path = 'pg_catalog, public, pg_temp') =>
  `create function public.p2(id uuid) returns void language sql security definer set search_path = ${path} as $$select 1$$;`;
const aclP2 =
  'revoke all on function public.p2(uuid) from PUBLIC, anon, authenticated; grant execute on function public.p2(uuid) to service_role;';
for (const [name, acl] of [
  [
    'missing revoke',
    'grant execute on function public.p2(uuid) to service_role;',
  ],
  ['missing authenticated', aclP2.replace(', authenticated', '')],
  ['missing grant', `${aclP2.split(';')[0]};`],
  ['signature mismatch', aclP2.replaceAll('p2(uuid)', 'p2(text)')],
  ['EXECUTE revoke only', aclP2.replace('revoke all', 'revoke execute')],
]) {
  test(`function-acl rejects ${name} and accepts complete ACL`, () => {
    assert.ok(
      scanExtensions(createP2() + acl).some((f) => f.rule === 'function-acl')
    );
    assert.deepEqual(scanExtensions(createP2() + aclP2), []);
  });
}
for (const setting of [
  'public',
  'pg_temp, pg_catalog',
  'pg_catalog, "$user", pg_temp',
  'pg_catalog',
  'pg_catalog, pg_temp, pg_temp',
]) {
  test(`definer-search-path rejects ${setting} in migrations and rollbacks`, () => {
    for (const rollback of [false, true]) {
      assert.ok(
        scanExtensions(createP2(setting) + aclP2, { rollback }).some(
          (f) => f.rule === 'definer-search-path'
        )
      );
      assert.deepEqual(scanExtensions(createP2() + aclP2, { rollback }), []);
    }
  });
}
for (const grant of [
  'grant select on public.t to anon;',
  'grant execute on function public.p2(uuid) to PUBLIC;',
  'grant maintain on public.t to authenticated;',
  'grant truncate on public.t to service_role;',
  'alter default privileges in schema public grant select on tables to authenticated;',
]) {
  test(`rollback-safety rejects ${grant}`, () => {
    assert.ok(
      scanExtensions(grant, { rollback: true }).some(
        (f) => f.rule === 'rollback-safety'
      )
    );
    assert.deepEqual(
      scanExtensions('grant select on public.t to authenticated;', {
        rollback: true,
      }),
      []
    );
  });
}
test('diagnostic debt fails on new findings, changed file bytes, and stale entries', () => {
  const file = 'apps/database/supabase/migrations/20200101000000_old.sql';
  const sql = createP2();
  const input = { files: [file], readFile: () => sql };
  const baseline = debt(collectDiagnostics(input).map(baselineEntry));
  assert.deepEqual(evaluateSqlFiles({ ...input, baseline }).violations, []);
  assert.ok(
    evaluateSqlFiles(input).violations.some((f) => f.rule === 'function-acl')
  );
  assert.ok(
    evaluateSqlFiles({
      ...input,
      baseline,
      readFile: () => `${sql}\n-- changed`,
    }).violations.some((f) => f.rule === 'baseline-file-changed')
  );
  assert.ok(
    evaluateSqlFiles({
      ...input,
      baseline,
      readFile: () => sql + aclP2,
    }).violations.some((f) => f.rule === 'baseline-stale')
  );
  assert.deepEqual(
    evaluateSqlFiles({
      ...input,
      baseline: debt([]),
      readFile: () => sql + aclP2,
    }).violations,
    []
  );
  assert.ok(
    evaluateSqlFiles({
      files: [],
      readFile: () => '',
      baseline,
    }).violations.some((f) => f.rule === 'baseline-stale')
  );
  const retired = {
    ...baseline,
    entries: baseline.entries.map((entry) => ({
      ...entry,
      rule: 'retired-rule',
    })),
  };
  assert.ok(
    evaluateSqlFiles({ ...input, baseline: retired }).violations.some(
      (f) => f.rule === 'baseline-stale'
    )
  );
  const additional = 'apps/database/supabase/migrations/20300101000000_new.sql';
  assert.ok(
    evaluateSqlFiles({
      files: [file, additional],
      readFile: () => sql,
      baseline,
    }).violations.some(
      (f) => f.file === additional && f.rule === 'function-acl'
    )
  );
  const bad = ROLLBACK.replace('example.rollback', 'wrong.rollback');
  assert.ok(
    evaluateSqlFiles({
      files: [MIGRATION, bad],
      readFile: () => '',
    }).violations.some((f) => f.rule === 'rollback-name')
  );
});
test('ACL before CREATE cannot satisfy function-acl; comments and bodies cannot satisfy it', () => {
  assert.ok(
    scanExtensions(aclP2 + createP2()).some((f) => f.rule === 'function-acl')
  );
  assert.ok(
    scanExtensions(`${createP2()}-- ${aclP2}`).some(
      (f) => f.rule === 'function-acl'
    )
  );
  assert.deepEqual(scanExtensions(`-- ${createP2()}`), []);
});

test('changed historical functions still need the new ACL fence', () => {
  const old = 'apps/database/supabase/migrations/20200101000000_old.sql';
  const result = evaluateSqlFiles({ files: [old], readFile: () => createP2() });
  assert.ok(result.violations.some((f) => f.rule === 'function-acl'));
});
test('a quoted identifier containing commas cannot masquerade as a safe path', () => {
  assert.ok(
    scanExtensions(createP2('"pg_catalog, pg_temp"') + aclP2).some(
      (f) => f.rule === 'definer-search-path'
    )
  );
});

test('rollback may revoke default privileges', () => {
  assert.deepEqual(
    scanExtensions(
      'alter default privileges in schema public revoke all on tables from authenticated;',
      { rollback: true }
    ),
    []
  );
});

test('spaced and comment-separated qualified names cannot skip ACL or path rules', () => {
  for (const name of [
    'public . p2',
    'public. p2',
    'public /* gap */ . /* gap */ p2',
  ]) {
    const findings = scanExtensions(
      createP2('public').replace('public.p2', name)
    );
    assert.ok(findings.some((f) => f.rule === 'function-acl'));
    assert.ok(findings.some((f) => f.rule === 'definer-search-path'));
    assert.deepEqual(
      scanExtensions(createP2().replace('public.p2', name) + aclP2),
      []
    );
  }
});
test('quoted semicolons cannot forge ACL statements', () => {
  const forged =
    createP2() +
    'create function public."z;revoke all on function public.p2(uuid) from public, anon, authenticated with a;grant execute on function public.p2(uuid) to service_role with b"() returns int language sql as $$select 1$$;';
  assert.ok(
    scanExtensions(forged).some(
      (f) => f.rule === 'function-acl' && f.detail.includes('public.p2')
    )
  );
});
test('duplicate search_path clauses are rejected', () => {
  assert.ok(
    scanExtensions(
      createP2('pg_catalog, pg_temp set search_path = public') + aclP2
    ).some((f) => f.rule === 'definer-search-path')
  );
});
test('ALTER security and path mutations require complete reviewed definitions', () => {
  for (const change of [
    'security definer',
    'set search_path = public',
    'reset search_path',
    'reset all',
  ]) {
    assert.ok(
      scanExtensions(
        `${createP2() + aclP2}alter function public.p2(uuid) ${change};`
      ).some((f) => f.rule === 'definer-search-path')
    );
  }
});
test('quoted case is preserved for paths, routine names and types', () => {
  assert.ok(
    scanExtensions(createP2('"PG_CATALOG", "PG_TEMP"') + aclP2).some(
      (f) => f.rule === 'definer-search-path'
    )
  );
  assert.ok(
    scanExtensions(createP2().replace('public.p2', 'public."P2"') + aclP2).some(
      (f) => f.rule === 'function-acl'
    )
  );
  assert.ok(
    scanExtensions(
      createP2().replace('id uuid', 'id "char"') +
        aclP2.replaceAll('(uuid)', '(char)')
    ).some((f) => f.rule === 'function-acl')
  );
  assert.deepEqual(
    scanExtensions(createP2('"pg_catalog", "pg_temp"') + aclP2),
    []
  );
});
test('procedure defaults, dynamic SQL, membership and grant options require review', () => {
  for (const sql of [
    createP2().replace('function', 'procedure'),
    "do $$begin execute 'grant postgres to authenticated'; end$$;",
    'grant postgres to authenticated;',
    'grant execute on function public.p2(uuid) to service_role with grant option;',
  ]) {
    assert.ok(scanExtensions(sql, { rollback: true }).length > 0);
  }
});
test('only a service_role ACL or genuine no-grant marker can satisfy intended access', () => {
  const revoke = `${aclP2.split(';')[0]};`;
  for (const kind of ['internal', 'trigger'])
    assert.deepEqual(
      scanExtensions(`-- tuturuuu: no-grant (${kind})\n${createP2()}${revoke}`),
      []
    );
  assert.deepEqual(
    scanExtensions(createP2() + aclP2.replace('grant execute', 'grant all')),
    []
  );
  for (const role of ['anon', 'authenticated'])
    assert.ok(
      scanExtensions(
        createP2() + aclP2.replace('to service_role', `to ${role}`)
      ).some((f) => f.rule === 'function-acl')
    );
  assert.ok(
    scanExtensions(
      `${createP2() + revoke}select '-- tuturuuu: no-grant (internal)';`
    ).some((f) => f.rule === 'function-acl')
  );
});
test('baseline can shrink but cannot grow or change diagnostic or file digests', () => {
  const file = 'apps/database/supabase/migrations/20200101000000_old.sql';
  const baseline = debt(
    collectDiagnostics({ files: [file], readFile: () => createP2() }).map(
      baselineEntry
    )
  );
  validateBaseline(debt([]), baseline);
  assert.throws(() => validateBaseline(baseline, debt([])), /shrink-only/);
  const changed = {
    ...baseline,
    entries: baseline.entries.map((entry) => ({
      ...entry,
      digest: digest('changed'),
    })),
  };
  assert.throws(() => validateBaseline(changed, baseline), /shrink-only/);
  const changedFile = {
    ...baseline,
    files: { ...baseline.files, [file]: digest('changed') },
  };
  assert.throws(() => validateBaseline(changedFile, baseline), /shrink-only/);
});
test('dynamic EXECUTE inside a dollar-quoted routine body requires review', () => {
  const sql = createP2().replace('select 1', "execute 'select 1'") + aclP2;
  assert.ok(scanExtensions(sql).some((f) => f.rule === 'dynamic-sql-review'));
  assert.ok(
    scanExtensions('grant "on" to authenticated;', { rollback: true }).some(
      (f) => f.rule === 'rollback-safety'
    )
  );
});

test('quoted and FROM CURRENT duplicate path clauses cannot replace a safe first path', () => {
  for (const clause of [
    'set "search_path" = public',
    'set search_path from current',
  ]) {
    assert.ok(
      scanExtensions(createP2(`pg_catalog, pg_temp ${clause}`) + aclP2).some(
        (f) => f.rule === 'definer-search-path'
      )
    );
  }
});

test('repository SQL grant enforcement has no findings outside shrink-only allowlist', () => {
  assert.deepEqual(
    checkRepository().violations.map((finding) => finding.message),
    []
  );
});

test('empty-string path is pinned while public alone and missing paths fail', () => {
  assert.deepEqual(scanExtensions(createP2("''") + aclP2), []);
  for (const sql of [
    createP2('public'),
    createP2().replace(' set search_path = pg_catalog, public, pg_temp', ''),
  ])
    assert.ok(
      scanExtensions(sql + aclP2).some((f) => f.rule === 'definer-search-path')
    );
});

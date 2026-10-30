const test = require('node:test');
const assert = require('node:assert/strict');
const { scanExtensions } = require('./sql-grant-guard');
const rules = (sql) => scanExtensions(sql).map((f) => f.rule);
test('Unicode GUC escapes fail closed including custom and malformed encodings', () => {
  for (const name of [
    'u&"\\0073earch_path"',
    'U&"\\0053EARCH_PATH"',
    'u&"!0073earch_path" uescape \'!\'',
    'u&"\\xyz"',
  ])
    assert.ok(
      rules(
        `create function f() returns int security definer set search_path=pg_catalog,pg_temp set ${name}=public language sql as $$select 1$$`
      ).includes('function-acl')
    );
});
test('standalone client routine grants fail by default', () => {
  for (const target of [
    'function f',
    'function f()',
    'all functions in schema public',
  ])
    assert.ok(
      rules(`grant execute on ${target} to authenticated`).includes(
        'function-acl'
      )
    );
  assert.ok(
    rules(
      'alter default privileges in schema public grant execute on functions to authenticated'
    ).includes('function-acl')
  );
});
test('policy names and separate safe path literals do not cause false positives', () => {
  assert.deepEqual(
    rules('create policy "Allow my members" on t using (true)'),
    []
  );
  assert.ok(
    !rules(
      "create function f() returns int security definer set search_path to 'pg_catalog','pg_temp' language sql as $$select 1$$"
    ).includes('definer-search-path')
  );
});
test('review comments cannot be forged inside literals or block comments', () => {
  const marker = 'tuturuuu: reviewed(dynamic-sql-review): security-review-123';
  assert.deepEqual(
    rules(`-- ${marker}\ndo
$$begin execute 'select 1'; end$$`),
    []
  );
  for (const prefix of [
    `/* ${marker} */`,
    `select '${marker}';`,
    `select $$-- ${marker}$$;`,
  ])
    assert.ok(
      rules(`${prefix}\ndo
$$begin execute 'select 1'; end$$`).includes('dynamic-sql-review')
    );
  assert.deepEqual(
    rules(
      '-- tuturuuu: reviewed(alter-routine-review): security-review-123\nalter function f() set search_path=public'
    ),
    []
  );
});
test('reviewed ALTER can waive both review findings without waiving client grants', () => {
  const marker =
    '-- tuturuuu: reviewed(alter-routine-review): security-review-123';
  for (const change of [
    'security definer',
    'set search_path = public',
    'reset all',
    'owner to postgres',
  ]) {
    assert.ok(rules(`alter function f() ${change}`).length > 0);
    assert.deepEqual(rules(`${marker}\nalter function f() ${change}`), []);
    assert.ok(
      rules(`select '${marker}';\nalter function f() ${change}`).length > 0
    );
  }
  assert.ok(
    rules(`${marker}\ngrant execute on function f to authenticated`).includes(
      'function-acl'
    )
  );
});
test('review markers apply only to their statement', () => {
  const { collectDiagnostics } = require('./sql-grant-guard-baseline');
  const sql =
    '-- tuturuuu: reviewed(dynamic-sql-review): security-review-123\ndo $$begin null; end$$;';
  const migration =
    'apps/database/supabase/migrations/20300101000000_review.sql';
  const schema = 'apps/database/supabase/schemas/review.sql';
  assert.deepEqual(
    collectDiagnostics({ files: [migration], readFile: () => sql }),
    []
  );
  assert.deepEqual(
    collectDiagnostics({ files: [schema], readFile: () => sql }),
    []
  );
  assert.ok(
    rules(`${sql}\ndo $$begin null; end$$`).includes('dynamic-sql-review')
  );
});
test('signature review is required for authenticated and anon-required for open roles', () => {
  const { scanSql } = require('./sql-grant-guard');
  const findings = (sql) => [
    ...scanSql(sql, { definerRule: false }),
    ...scanExtensions(sql),
  ];
  const marker =
    '-- tuturuuu: reviewed(function-grant): public.f(integer) review=desk-123';
  const grant = 'grant execute on function public.f(integer) to authenticated;';
  assert.deepEqual(findings(`${marker}\n${grant}`), []);
  for (const role of ['anon', 'PUBLIC']) {
    const open = grant.replace('authenticated', role);
    assert.ok(findings(`${marker}\n${open}`).length > 0);
    assert.deepEqual(
      findings(
        `${marker.replace(' review=', ' anon-required review=')}\n${open}`
      ),
      []
    );
  }
  for (const sql of [
    `${marker.replace('integer', 'text')}\n${grant}`,
    `${marker}\nselect 1;\n${grant}`,
    `select '${marker}';\n${grant}`,
    `select $$${marker}$$;\n${grant}`,
    `/* ${marker} */\n${grant}`,
    `${marker}\n${grant.replace('f(integer)', 'f')}`,
    `${marker}\n${grant.replace('f(integer)', 'f(integer), public.g(integer)')}`,
  ])
    assert.ok(findings(sql).length > 0, sql);
  for (const target of [
    'all functions in schema public',
    'all tables in schema public',
    'all sequences in schema public',
  ])
    for (const role of ['anon', 'authenticated', 'PUBLIC'])
      assert.ok(
        findings(
          `${marker.replace(' review=', ' anon-required review=')}\ngrant all on ${target} to ${role};`
        ).length > 0
      );
  assert.ok(
    findings(
      `${marker}\nalter default privileges grant select on tables to authenticated;`
    ).length > 0
  );
  assert.ok(
    findings('grant execute on function public.f to service_role;').length > 0
  );
});
test('reviewed grants work across files and after CREATE without relaxing required revokes', () => {
  const { collectDiagnostics } = require('./sql-grant-guard-baseline');
  const files = [
    'apps/database/supabase/migrations/20300101000000_create.sql',
    'apps/database/supabase/migrations/20300101000001_grant.sql',
  ];
  const create =
    '-- tuturuuu: no-grant (internal)\ncreate function public.f(integer) returns int language sql as $$select 1$$; revoke all on function public.f(integer) from public,anon,authenticated;';
  const grant =
    '-- tuturuuu: reviewed(function-grant): public.f(integer) review=desk-123\ngrant execute on function public.f(integer) to authenticated;';
  assert.deepEqual(
    collectDiagnostics({
      files,
      readFile: (file) => (file === files[0] ? create : grant),
    }),
    []
  );
  assert.deepEqual(
    rules(
      `${create.replace('-- tuturuuu: no-grant (internal)\n', '')}\n${grant}`
    ),
    []
  );
  assert.ok(
    rules(
      create.replace(
        'revoke all on function public.f(integer) from public,anon,authenticated;',
        ''
      ) +
        '\n' +
        grant
    ).includes('function-acl')
  );
});
test('reviewed dynamic bodies keep ACL requirements and statement fingerprints bind full bodies', () => {
  const { collectDiagnostics } = require('./sql-grant-guard-baseline');
  const file = 'apps/database/supabase/migrations/20300101000000_body.sql';
  const sql = "do $$\nbegin execute 'select 1'; end\n$$;";
  const collect = (value) =>
    collectDiagnostics({ files: [file], readFile: () => value });
  assert.notEqual(
    collect(sql)[0].digest,
    collect(sql.replace('select 1', 'select 2'))[0].digest
  );
  assert.deepEqual(
    rules(`-- tuturuuu: reviewed(dynamic-sql-review): desk-123\n${sql}`),
    []
  );
  const routine =
    "create function public.f() returns int language plpgsql as $$begin execute 'select 1'; end$$;";
  const reviewed = rules(
    `-- tuturuuu: reviewed(dynamic-sql-review): desk-123\n${routine}`
  );
  assert.ok(!reviewed.includes('dynamic-sql-review'));
  assert.ok(reviewed.includes('function-acl'));
});
test('real-debt class tags survive baseline generation and cannot be rewritten', () => {
  const {
    collectDiagnostics,
    baselineEntry,
    makeBaseline,
    validateBaseline,
  } = require('./sql-grant-guard-baseline');
  const file =
    'apps/database/rollbacks/20261029012300_tighten_legacy_table_grants.rollback.sql';
  const diagnostics = collectDiagnostics({
    files: [file],
    readFile: () => '\ngrant all on public.t to anon;',
  });
  const baseline = makeBaseline('a'.repeat(40), diagnostics.map(baselineEntry));
  const tagged = baseline.entries.filter((e) => e.class);
  assert.ok(tagged.length > 0);
  assert.ok(tagged.every((e) => e.class === 'latent-rollback-grant'));
  validateBaseline(baseline);
  const changed = structuredClone(baseline);
  changed.entries.find((e) => e.class).class = 'definer-path-hygiene';
  assert.throws(() => validateBaseline(changed, baseline), /shrink-only/);
});

test('unparseable routine grant argument lists fail closed', () => {
  assert.ok(
    rules('grant execute on function public.f( to service_role;').includes(
      'function-acl'
    )
  );
});

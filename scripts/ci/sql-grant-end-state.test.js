const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateSqlFiles, RULES } = require('./sql-grant-guard');

const directory = 'apps/database/supabase/migrations/';
const create =
  'create or replace function public.f(p uuid) returns void language sql security definer as $$ select $$;';
const revoke = 'revoke execute on function public.f(uuid) from public, anon;';

// Fixture versions between the guard cutoff and the inherited-ACL cutoff, where
// a revoke in a later migration still counts.
function evaluate(sqls, prefix = '2026102900000') {
  const fixtures = Object.fromEntries(
    sqls.map((sql, i) => [`${directory}${prefix}${i}_fixture.sql`, sql])
  );
  return evaluateSqlFiles({
    files: Object.keys(fixtures).reverse(),
    readFile: (file) => fixtures[file],
  });
}
function failures(result) {
  return result.violations.filter(
    (finding) => finding.rule === RULES.definerPublic
  );
}

test('same-file revoke after creation passes', () => {
  assert.deepEqual(evaluate([`${create}\n${revoke}`]).violations, []);
});

test('later migration passes in timestamp order and reports its evidence', () => {
  const result = evaluate([create, revoke]);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.satisfied, [
    {
      file: `${directory}20261029000000_fixture.sql`,
      line: 1,
      signature: 'public.f(uuid)',
      mode: 'revoke-after-creation',
      note: null,
      evidence: [
        {
          role: 'public',
          file: `${directory}20261029000001_fixture.sql`,
          line: 1,
        },
        {
          role: 'anon',
          file: `${directory}20261029000001_fixture.sql`,
          line: 1,
        },
      ],
    },
  ]);
});

test('earlier revoke cannot satisfy a later replacement', () => {
  assert.equal(failures(evaluate([revoke, create])).length, 1);
  assert.equal(failures(evaluate([`${revoke}\n${create}`])).length, 1);
  assert.equal(failures(evaluate([`${create}\n${revoke}`, create])).length, 1);
});

test('another overload or an unspecified signature cannot satisfy the rule', () => {
  for (const target of ['public.f(text)', 'public.g(uuid)', 'public.f']) {
    assert.equal(
      failures(
        evaluate([
          create,
          `revoke all on function ${target} from public, anon;`,
        ])
      ).length,
      1
    );
  }
});

test('a later anon grant invalidates proof even with an allow marker', () => {
  const grant =
    '-- allow-anon-grant: deliberate fixture\ngrant execute on function public.f(uuid) to anon;';
  const result = evaluate([create, revoke, grant]);
  assert.equal(failures(result).length, 1);
  assert.deepEqual(result.satisfied, []);
  assert.deepEqual(evaluate([create, revoke, grant, revoke]).violations, []);
});

test('schema-wide re-grants invalidate proof', () => {
  assert.equal(
    failures(
      evaluate([
        create,
        revoke,
        'grant execute on all functions in schema public to anon;',
      ])
    ).length,
    1
  );
});

test('non-execute revokes and manual rollbacks cannot satisfy the rule', () => {
  assert.equal(
    failures(
      evaluate([
        create,
        'revoke grant option for execute on function public.f(uuid) from public, anon;',
      ])
    ).length,
    1
  );
  const migration = `${directory}20261029000000_fixture.sql`;
  const rollback = 'apps/database/rollbacks/20261029000001_fixture.sql';
  const fixtures = { [migration]: create, [rollback]: revoke };
  assert.equal(
    failures(
      evaluateSqlFiles({
        files: Object.keys(fixtures),
        readFile: (file) => fixtures[file],
      })
    ).length,
    1
  );
});

test('partial revokes across later migrations combine with evidence for each', () => {
  const result = evaluate([
    create,
    'revoke all on function public.f(uuid) from public;',
    'revoke all on function public.f(uuid) from anon;',
  ]);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(
    result.satisfied[0].evidence.map((item) => item.file),
    [
      `${directory}20261029000001_fixture.sql`,
      `${directory}20261029000002_fixture.sql`,
    ]
  );
});

test('migrations after the inherited-ACL cutoff need the revoke in the same file', () => {
  const later = evaluate([create, revoke], '2026110100000');
  assert.equal(failures(later).length, 1);
  assert.match(failures(later)[0].message, /need the revoke in the same file/);
  assert.deepEqual(
    evaluate([`${create}\n${revoke}`], '2026110100000').violations,
    []
  );
});

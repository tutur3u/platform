const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateSqlFiles, RULES } = require('./sql-grant-guard');

const directory = 'apps/database/supabase/migrations';
const first = directory + '/20261101000000_create.sql';
const later = directory + '/20261102000000_revoke.sql';
const create =
  'create or replace function public.secret(p_id uuid) returns void language sql security definer as $$ select $$;';
const revoke =
  'revoke execute on function public.secret(uuid) from public, anon;';

function evaluate(fixtures) {
  return evaluateSqlFiles({
    files: Object.keys(fixtures),
    readFile: (file) => fixtures[file],
  }).violations;
}

test('end state accepts a same-file revoke for the exact signature', () => {
  assert.deepEqual(evaluate({ [first]: create + revoke }), []);
});

test('end state accepts a later migration revoke regardless of input order', () => {
  assert.deepEqual(evaluate({ [later]: revoke, [first]: create }), []);
});

test('end state rejects a definer without any revoke', () => {
  const findings = evaluate({ [first]: create });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, RULES.definerPublic);
  assert.equal(findings[0].file, first);
});

test('end state rejects a later revoke for a different signature', () => {
  const findings = evaluate({
    [first]: create,
    [later]: 'revoke all on function public.secret(text) from public, anon;',
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /public.secret\(uuid\)/);
});

test('end state can combine the required role revokes across migrations', () => {
  assert.deepEqual(
    evaluate({
      [first]:
        create + 'revoke execute on function public.secret(uuid) from public;',
      [later]:
        'revoke all privileges on function public.secret(uuid) from anon, authenticated;',
    }),
    []
  );
});

test('end state rejects a later revoke that leaves anon executable', () => {
  const findings = evaluate({
    [first]: create,
    [later]: 'revoke all on function public.secret(uuid) from public;',
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /from anon$/);
});

test('end state does not use an earlier migration revoke for a replacement', () => {
  assert.equal(
    evaluate({
      [first]: revoke,
      [later]: create,
    }).length,
    1
  );
});

test('end state does not use rollback revokes as forward migration evidence', () => {
  assert.equal(
    evaluate({
      [first]: create,
      'apps/database/rollbacks/20261103000000_revoke.rollback.sql': revoke,
    }).length,
    1
  );
});

test('end state requires EXECUTE or ALL, not another privilege or grant option', () => {
  for (const privilege of ['select', 'grant option for execute']) {
    assert.equal(
      evaluate({
        [first]: create,
        [later]:
          'revoke ' +
          privilege +
          ' on function public.secret(uuid) from public, anon;',
      }).length,
      1
    );
  }
});

test('end state requires the signature even when a name-only revoke is present', () => {
  assert.equal(
    evaluate({
      [first]: create,
      [later]: 'revoke execute on function public.secret from public, anon;',
    }).length,
    1
  );
});

test('end state preserves the independent prohibition on open grants', () => {
  const findings = evaluate({
    [first]: create,
    [later]: 'grant execute on function public.secret(uuid) to anon;' + revoke,
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, RULES.anonGrant);
});

test('end state rejects a regrant after a matching revoke', () => {
  const findings = evaluate({
    [first]: create + revoke,
    [later]: 'grant execute on function public.secret(uuid) to anon;',
  });
  assert.deepEqual(
    findings.map((finding) => finding.rule),
    [RULES.definerPublic, RULES.anonGrant]
  );
});

test('end state does not reuse a revoke across drop and recreate', () => {
  assert.equal(
    evaluate({
      [first]: create + revoke,
      [later]: 'drop function public.secret(uuid);' + create,
    }).length,
    2
  );
});

test('end state does not use a same-file revoke before creation', () => {
  assert.equal(evaluate({ [first]: revoke + create }).length, 1);
});

test('end state does not infer chronology for unversioned migrations', () => {
  assert.equal(
    evaluate({
      [directory + '/unversioned.sql']: create,
      [later]: revoke,
    }).length,
    1
  );
});

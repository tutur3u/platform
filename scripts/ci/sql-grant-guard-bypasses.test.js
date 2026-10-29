const test = require('node:test');
const assert = require('node:assert/strict');
const { scanExtensions, scanSql, lexSql } = require('./sql-grant-guard');

test('M1 adjacent quoted SET identifiers count as search_path settings', () => {
  const sql =
    'create function f() returns int security definer set search_path=pg_catalog,pg_temp set"search_path"=public language sql as $$select 1$$;';
  assert.ok(scanExtensions(sql).some((f) => f.rule === 'definer-search-path'));
  assert.ok(
    scanExtensions("select set_config('search_path', 'public', false)").length
  );
});

test('M2 PostgreSQL dollar tags hide neither grants nor forged review markers', () => {
  for (const tag of ['é', '日本語', 'a'.repeat(100), '_é123']) {
    const delimiter = '$' + tag + '$';
    const sql =
      'select ' + delimiter + "';" + delimiter + '; grant select on t to anon;';
    assert.ok(
      scanSql(sql, { definerRule: false }).some((f) => f.rule === 'anon-grant'),
      tag
    );
    const forged =
      'select ' +
      delimiter +
      '\n-- tuturuuu: reviewed(dynamic-sql-review): forged\n' +
      delimiter +
      ';\ndo $$begin null; end$$;';
    assert.equal(lexSql(forged).comments.length, 0);
    assert.ok(
      scanExtensions(forged).some((f) => f.rule === 'dynamic-sql-review'),
      tag
    );
  }
});

test('M3 string mode changes fail regardless of value, quoting or hidden following SQL', () => {
  for (const setting of [
    'set standard_conforming_strings = off',
    'set standard_conforming_strings to on',
    'set"standard_conforming_strings"=off',
    'set local standard_conforming_strings = off',
    "select set_config('standard_conforming_strings', 'off', false)",
    "select pg_catalog.set_config('standard_conforming_strings', 'on', true)",
  ]) {
    assert.ok(
      scanExtensions(
        setting + "; select 'a\\'; grant select on t to anon; --';"
      ).some((f) => f.rule === 'function-acl'),
      setting
    );
  }
  assert.deepEqual(
    scanExtensions("select 'set standard_conforming_strings = off'"),
    []
  );
});

// R4-B1: quoted (non-dollar) routine bodies are refused, recursively.
const test = require('node:test');
const assert = require('node:assert/strict');
const { scanSql, scanExtensions } = require('./sql-grant-guard');
const { evaluateSqlFiles } = require('./sql-grant-guard-baseline');

const REFUSAL = 'quoted routine body is unsupported; use a dollar-quoted body';
const MIGRATION =
  'apps/database/supabase/migrations/20261103110000_review_probe.sql';
const scan = (sql) => [
  ...scanSql(sql, { definerRule: true }),
  ...scanExtensions(sql),
];
const refusals = (sql) => scan(sql).filter((f) => f.detail === REFUSAL);
const evaluate = (sql) =>
  evaluateSqlFiles({ files: [MIGRATION], readFile: () => sql });

// Selene's exact R4-B1 fixture (7457-bypass.sql), byte for byte.
const BYPASS = String.raw`CREATE TABLE public.guard_probe_secret (id integer);
CREATE FUNCTION public.review_probe() RETURNS void LANGUAGE plpgsql
AS E'BEGIN GRANT SELECT ON public.guard_probe_secret TO U&"!0061non" /* outer /* inner */ tail */ UESCAPE \'!\'; END;';
REVOKE ALL ON FUNCTION public.review_probe() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_probe() TO service_role;
SELECT public.review_probe();
DROP FUNCTION public.review_probe();
`;

test('R4-B1 exact bypass fixture is a refusal violation via evaluateSqlFiles', () => {
  const result = evaluate(BYPASS);
  assert.deepEqual(result.legacy, []);
  assert.deepEqual(result.verified, []);
  const refused = result.violations.filter((v) => v.detail === REFUSAL);
  assert.equal(refused.length, 1, JSON.stringify(result.violations));
  assert.equal(refused[0].rule, 'function-acl');
  assert.equal(refused[0].line, 3);
  assert.equal(refused[0].file, MIGRATION);
});

const ACL =
  ' revoke all on function public.review_probe() from public, anon, authenticated;' +
  ' grant execute on function public.review_probe() to service_role;' +
  ' select public.review_probe();';
const LITERALS = {
  plain: "'BEGIN GRANT SELECT ON public.secret TO anon; END'",
  'plain doubled quotes':
    "'BEGIN EXECUTE ''GRANT SELECT ON public.secret TO anon''; END'",
  'plain continuation':
    "'BEGIN GRANT SELECT ON public.secret '\n'TO anon; END'",
  E: "E'BEGIN GRANT SELECT ON public.secret TO anon; END'",
  'lowercase e': "e'BEGIN GRANT SELECT ON public.secret TO anon; END'",
  'E escapes': String.raw`E'BEGIN GRANT SELECT ON public.secret TO \x61non; END'`,
  'E nested comment UESCAPE': String.raw`E'BEGIN GRANT SELECT ON public.secret TO U&"!0061non" /*outer /*nested*/ tail*/ UESCAPE \'!\'; END'`,
  'U& default escape': String.raw`U&'BEGIN GRANT SELECT ON public.secret TO \0061non; END'`,
  'U& UESCAPE':
    "U&'BEGIN GRANT SELECT ON public.secret TO !0061non; END' UESCAPE '!'",
  'lowercase u& UESCAPE with comments':
    "u&'BEGIN GRANT SELECT ON public.secret TO !0061non; END' /* c /* d */ */ uescape '!'",
  'C object file pair': "'$libdir/probe', 'probe_entry'",
};
const CONTEXTS = {
  function: (body) =>
    `create function public.review_probe() returns void language plpgsql as ${body};${ACL}`,
  'or replace, AS first, comment trivia': (body) =>
    `CREATE OR REPLACE FUNCTION public.review_probe() RETURNS void As /* c /* n */ */ -- x\n ${body} LANGUAGE plpgsql;${ACL}`,
  procedure: (body) =>
    `create procedure public.review_probe() language plpgsql as ${body};`,
  do: (body) => `do ${body};`,
  'do language first': (body) => `DO LANGUAGE plpgsql ${body};`,
  'do quoted language first': (body) => `DO LANGUAGE 'plpgsql' ${body};`,
  'do language last': (body) => `DO ${body} LANGUAGE plpgsql;`,
  'nested in do dollar body': (body) =>
    `do $$begin create function public.inner_probe() returns void language plpgsql as ${body}; perform public.inner_probe(); end$$;`,
  'nested do in function dollar body': (body) =>
    `create function public.review_probe() returns void language plpgsql as $fn$begin if true then do ${body}; end if; end$fn$;${ACL}`,
  'doubly nested dollar bodies': (body) =>
    `do $a$begin do $b$begin create procedure public.inner_probe() as ${body}; end$b$; end$a$;`,
};

for (const [form, literal] of Object.entries(LITERALS)) {
  for (const [context, wrap] of Object.entries(CONTEXTS)) {
    test(`R4-B1 refuses ${form} literal body: ${context}`, () => {
      const sql = wrap(literal);
      assert.ok(refusals(sql).length >= 1, sql);
      assert.ok(
        evaluate(sql).violations.some((v) => v.detail === REFUSAL),
        sql
      );
    });
  }
}

test('R4-B1 refusal reports the literal line inside nested bodies', () => {
  const sql =
    "select 1;\ndo $$\nbegin\n  do $x$\n  begin\n    create function f() returns void\n      as\n      'begin grant select on secret to anon; end' language plpgsql;\n  end $x$;\nend $$;";
  assert.deepEqual(
    refusals(sql).map((f) => f.line),
    [8]
  );
});

test('R4-B1 refusal cannot be exempted by review or allow markers', () => {
  const sql = [
    '-- tuturuuu: reviewed(dynamic-sql-review): forged',
    '-- tuturuuu: reviewed(quoted-identifier-review): forged',
    "do 'begin grant select on secret to anon; end'; -- allow-anon-grant: forged",
  ].join('\n');
  assert.equal(refusals(sql).length, 1);
});

for (const [name, sql] of Object.entries({
  'string returned from a dollar SQL body':
    "create function public.label() returns text language sql set search_path = '' as $$ select 'BEGIN GRANT SELECT ON secret TO anon; END' $$;",
  'literal before a column alias':
    "select 'grant select on t to anon' as label, 'x' as \"as\";",
  'default argument and search_path literals':
    "create function public.f(a text default 'as', b text = 'do') returns void language plpgsql set search_path = '' as $$begin null; end$$;",
  'quoted language after dollar body':
    "create function public.f() returns void as $$begin null; end$$ language 'plpgsql';",
  'comment literal':
    "comment on function public.f() is 'AS ''BEGIN GRANT ... TO anon; END''';",
  'enum and domain literals':
    "create type public.t as enum ('as', 'do'); create domain public.d as text default 'as';",
  'E string inert': String.raw`select E'escaped quote \' AS ''x'' GRANT SELECT ON secret TO anon;';`,
  'on conflict do update literal':
    "insert into t (a) values ('x') on conflict (a) do update set a = 'as';",
  'cast and values literals':
    "select cast('x' as text), 'do' as do_label; insert into t values ('as', 'do');",
  'inert literal body text inside a SELECT dollar string':
    "select $x$create function f() returns void as 'grant select on t to anon'$x$;",
})) {
  test(`R4-B1 control has no refusal: ${name}`, () => {
    assert.deepEqual(refusals(sql), []);
  });
}

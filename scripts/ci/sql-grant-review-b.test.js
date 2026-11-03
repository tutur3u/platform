const test = require('node:test');
const assert = require('node:assert/strict');
const { scanSql } = require('./sql-grant-guard');
const grants = (sql) =>
  scanSql(sql, { definerRule: false }).filter((f) => f.rule === 'anon-grant');
test('trailing exemption does not exempt the next grant', () => {
  assert.equal(
    grants(
      'grant select on t to anon; -- allow-anon-grant: reviewed\ngrant select on secret to anon;'
    ).length,
    1
  );
});
test('same-line DO owner cannot hide body grant', () => {
  assert.equal(
    grants(
      'select 1; do $$begin grant select on secret to anon; end$$; -- allow-anon-grant: unrelated'
    ).length,
    1
  );
});
test('quoted anon WITH GRANT OPTION in a body is detected', () => {
  assert.equal(
    grants(
      'do $$begin grant select on secret to "anon" WITH GRANT OPTION; end$$;'
    ).length,
    1
  );
});
test('custom UESCAPE and default Unicode role names are detected', () => {
  for (const role of [
    'U&"!0061non" UESCAPE \'!\'',
    'U&"\\0061non"',
    'U&"\\+000061non"',
  ]) {
    assert.equal(grants(`grant select on secret to ${role};`).length, 1, role);
  }
});
test('trailing exemption owns only the final same-line statement', () => {
  assert.equal(
    grants(
      'grant select on t to anon; grant select on secret to anon; -- allow-anon-grant: reviewed'
    ).length,
    1
  );
});
test('preceding and internal markers still exempt their own statement', () => {
  for (const sql of [
    '-- allow-anon-grant: reviewed\ngrant select on t to anon;',
    'grant select -- allow-anon-grant: reviewed\non t to anon;',
  ])
    assert.equal(grants(sql).length, 0, sql);
});
test('Unicode normalization preserves comment ownership and diagnostic lines', () => {
  const findings = grants(
    'grant select on t to U&"\\0061non"; -- allow-anon-grant: reviewed\ngrant select on secret to "anon";'
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 2);
});
test('custom escape metacharacters and nested Unicode roles are detected', () => {
  for (const escapeChar of ['!', '.', '*', '$', ']']) {
    const role = `U&"${escapeChar}0061non" UESCAPE '${escapeChar}'`;
    assert.equal(
      grants(
        `do $$begin grant select on secret to ${role} WITH GRANT OPTION; end$$;`
      ).length,
      1,
      role
    );
  }
});
test('quoted distinct roles and doubled Unicode escapes stay distinct', () => {
  for (const role of [
    '"ANON"',
    '"anon_reader"',
    'U&"!!0061non" UESCAPE \'!\'',
  ]) {
    assert.equal(grants(`grant select on t to ${role};`).length, 0, role);
  }
});

for (const [name, sql] of [
  [
    'block comment',
    `grant select on secret to U&"!0061non" /* x */ UESCAPE '!';`,
  ],
  ['line comment', `grant select on secret to U&"!0061non" -- x\nUESCAPE '!';`],
  ['no whitespace', `grant select on secret to U&"!0061non"UESCAPE'!';`],
  [
    'no literal whitespace',
    `grant select on secret to U&"!0061non" UESCAPE'!';`,
  ],
  ['semicolon escape', `grant select on secret to U&";0061non" UESCAPE ';';`],
  [
    'IF THEN',
    `do $$begin if true then grant select on secret to anon; end if; end$$;`,
  ],
  [
    'ELSE',
    `do $$begin if false then null; else grant select on secret to anon; end if; end$$;`,
  ],
  ['LOOP', `do $$begin loop grant select on secret to anon; end loop; end$$;`],
  ['GROUP', `do $$begin grant select on secret to group anon; end$$;`],
  [
    'GRANTED BY',
    `do $$begin grant select on secret to anon granted by current_user; end$$;`,
  ],
]) {
  test(`review r2 detects ${name}`, () => assert.equal(grants(sql).length, 1));
}

for (const depth of [1, 2]) {
  const comment = '/* outer ' + '/* inner '.repeat(depth) + 'tail */'.repeat(depth + 1);
  for (const after of [false, true]) {
    const role = after ? `U&"!0061non" UESCAPE ${comment} '!'` : `U&"!0061non" ${comment} UESCAPE '!'`;
    for (const context of ['top', 'function', 'do', 'nested']) {
      test(`nested trivia depth ${depth}, after ${after}, ${context}`, () => {
        const grant = `grant select on public.secret to ${role};`;
        const sql = context === 'top' ? grant : context === 'function'
          ? `create function public.tmp_open() returns void language plpgsql set search_path = pg_catalog, pg_temp as $$begin ${grant} end$$; revoke all on function public.tmp_open() from public, anon, authenticated; grant execute on function public.tmp_open() to service_role; select public.tmp_open(); drop function public.tmp_open();`
          : context === 'do' ? `do $$begin ${grant} end$$;`
          : `do $outer$begin do $$begin ${grant} end$$; end$outer$;`;
        assert.ok(scanSql(sql, { definerRule: true }).some(f => f.rule === 'anon-grant' || f.detail === 'unparsed UESCAPE requires scanner support'));
      });
    }
  }
}

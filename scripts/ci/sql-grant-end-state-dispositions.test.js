const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { evaluateSqlFiles, scanSql } = require('./sql-grant-end-state-guard');
const {
  REVIEWED_END_STATE_FINDINGS,
  matchEndStateFinding,
} = require('./sql-grant-reviewed-exceptions');

const root = path.resolve(__dirname, '../..');
const source = Object.fromEntries(
  [
    ...new Set(
      REVIEWED_END_STATE_FINDINGS.flatMap((entry) =>
        [entry.file, entry.requiredFile].filter(Boolean)
      )
    ),
  ].map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')])
);
const evaluate = (fixtures) =>
  evaluateSqlFiles({
    files: Object.keys(fixtures),
    readFile: (file) => fixtures[file],
  });

test('exact reviewed contracts cover only the six inventoried findings', () => {
  const result = evaluate(source);
  assert.deepEqual(result.violations, []);
  assert.equal(
    result.satisfied.filter((entry) => entry.mode === 'reviewed-disposition')
      .length,
    6
  );
});

for (const entry of REVIEWED_END_STATE_FINDINGS) {
  const findings = scanSql(source[entry.file], {
    file: entry.file,
    definerRule: !entry.file.includes('/rollbacks/'),
    sameFileOnly: true,
  });
  for (const finding of findings) {
    const options = {
      file: entry.file,
      sql: source[entry.file],
      finding,
      files: Object.keys(source),
      readFile: (file) => source[file],
    };
    test(`${entry.file}:${finding.line} binds file, rule, line and finding text`, () => {
      assert.equal(matchEndStateFinding(options), entry);
      for (const mutation of [
        { sql: `${options.sql}\n` },
        { file: `${entry.file}.other` },
        { finding: { ...finding, line: finding.line + 1 } },
        { finding: { ...finding, rule: 'another-rule' } },
        {
          finding: {
            ...finding,
            detail: `${finding.detail} changed-signature`,
          },
        },
      ])
        assert.equal(matchEndStateFinding({ ...options, ...mutation }), null);
    });
  }

  test(`${entry.file}: source mutation stays blocking`, () => {
    const result = evaluate({
      ...source,
      [entry.file]: `${source[entry.file]}\n`,
    });
    assert.ok(result.violations.some((finding) => finding.file === entry.file));
  });

  if (entry.requiredFile) {
    test(`${entry.file}: missing or changed paired forward migration stays blocking`, () => {
      const absent = { ...source };
      delete absent[entry.requiredFile];
      for (const fixtures of [
        absent,
        { ...source, [entry.requiredFile]: `${source[entry.requiredFile]}\n` },
      ])
        assert.ok(
          evaluate(fixtures).violations.some(
            (finding) => finding.file === entry.file
          )
        );
    });
  }
}

test('new and later PUBLIC/anon grants are not covered by another finding', () => {
  const extra = 'apps/database/supabase/migrations/20261120000000_reopen.sql';
  const result = evaluate({
    ...source,
    [extra]:
      'grant execute on function public.validate_cross_app_token(text,text) to public, anon;',
  });
  assert.ok(
    result.violations.some(
      (finding) => finding.file === extra && finding.rule === 'anon-grant'
    )
  );
});

test('review comments without exact source and finding bindings do not grant a disposition', () => {
  const extra =
    'apps/database/supabase/migrations/20261120000001_unreviewed.sql';
  const result = evaluate({
    ...source,
    [extra]:
      '-- tuturuuu: reviewed(function-grant): public.f() anon-required review=fixture\ngrant execute on function public.f() to anon;',
  });
  assert.ok(
    result.violations.some(
      (finding) => finding.file === extra && finding.rule === 'anon-grant'
    )
  );
});

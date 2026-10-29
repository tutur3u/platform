const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  REVIEWED_EXCEPTIONS,
  digestBlock,
  findDoBlocks,
} = require('./sql-grant-reviewed-exceptions');
const {
  RULES,
  evaluateSqlFiles,
  formatSatisfied,
  lexSql,
} = require('./sql-grant-guard');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE =
  'apps/database/supabase/migrations/20261029040800_finance_workspace_boundaries.sql';
const SQL = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const REASON =
  'pre-creation revoke on pre-existing signatures; CREATE OR REPLACE preserves ACL; bodies gate on auth.role() = service_role (SR-843)';

function run(fixtures) {
  return evaluateSqlFiles({
    files: Object.keys(fixtures).sort(),
    readFile: (file) => fixtures[file],
  });
}
function definerFailures(result) {
  return result.violations.filter((item) => item.rule === RULES.definerPublic);
}
function exceptions(result) {
  return result.satisfied.filter((item) => item.mode === 'reviewed-exception');
}
const BLOCK_START = SQL.indexOf('DO $$\nDECLARE fn record;');
const BLOCK_END = SQL.indexOf('$$;', BLOCK_START) + 3;
const BLOCK = SQL.slice(BLOCK_START, BLOCK_END);

test('the reviewed exception is frozen and bound to one file, block and four signatures', () => {
  assert.equal(REVIEWED_EXCEPTIONS.length, 1);
  const [entry] = REVIEWED_EXCEPTIONS;
  assert.ok(Object.isFrozen(REVIEWED_EXCEPTIONS) && Object.isFrozen(entry));
  assert.ok(Object.isFrozen(entry.signatures));
  assert.equal(entry.file, FILE);
  assert.equal(entry.reason, REASON);
  assert.deepEqual(
    [...entry.signatures],
    [
      'public.get_daily_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
      'public.get_monthly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
      'public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
      'public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date,integer)',
    ]
  );
  assert.equal(digestBlock(BLOCK), entry.blockSha256);
  assert.match(
    BLOCK,
    /REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated/
  );
});

test('the exact file passes, with the reviewed exception printed for each signature', () => {
  const result = run({ [FILE]: SQL });
  assert.deepEqual(result.violations, []);
  const reviewed = exceptions(result);
  assert.equal(reviewed.length, 4);
  for (const entry of reviewed) {
    assert.match(
      formatSatisfied(entry),
      /reviewed exception \(source-bound\): SR-843-finance-invoice-totals: pre-creation revoke/
    );
  }
});

test('the same content under any other path gets no exception', () => {
  for (const other of [
    'apps/database/supabase/migrations/20261029040801_finance_copy.sql',
    'apps/database/supabase/migrations/20261029040800_finance_workspace_boundaries_v2.sql',
    'apps/database/supabase/migrations/99999999999999_finance_workspace_boundaries.sql',
  ]) {
    const result = run({ [other]: SQL });
    assert.equal(definerFailures(result).length, 4, other);
    assert.deepEqual(exceptions(result), []);
  }
});

test('a changed block gets no exception', () => {
  const edits = [
    BLOCK.replace('FROM PUBLIC, anon, authenticated', 'FROM PUBLIC, anon'),
    BLOCK.replace(
      "'get_monthly_invoice_totals'",
      "'get_monthly_invoice_totals_x'"
    ),
    BLOCK.replace('DECLARE fn record;', 'DECLARE fn record; -- reviewed'),
    BLOCK.replace('GRANT EXECUTE', 'GRANT ALL'),
  ];
  for (const edited of edits) {
    assert.notEqual(edited, BLOCK);
    const result = run({ [FILE]: SQL.replace(BLOCK, edited) });
    assert.equal(definerFailures(result).length, 4, edited);
    assert.deepEqual(exceptions(result), []);
  }
  // Trailing whitespace is the only normalized difference.
  assert.deepEqual(
    definerFailures(
      run({
        [FILE]: SQL.replace('DECLARE fn record;', 'DECLARE fn record;   '),
      })
    ),
    []
  );
});

test('a removed, commented-out or relocated block gets no exception', () => {
  assert.equal(
    definerFailures(run({ [FILE]: SQL.replace(BLOCK, '') })).length,
    4
  );
  assert.equal(
    definerFailures(run({ [FILE]: SQL.replace(BLOCK, `/*\n${BLOCK}\n*/`) }))
      .length,
    4
  );
  assert.equal(
    definerFailures(
      run({
        [FILE]: SQL.replace(BLOCK, `-- ${BLOCK.split('\n').join('\n-- ')}`),
      })
    ).length,
    4
  );
  // A block after the creation statements does not precede them.
  const moved = `${SQL.replace(BLOCK, '')}\n${BLOCK}\n`;
  assert.equal(definerFailures(run({ [FILE]: moved })).length, 4);
  assert.equal(
    findDoBlocks(SQL, lexSql(SQL).code).filter(
      (b) => b.digest === REVIEWED_EXCEPTIONS[0].blockSha256
    ).length,
    1
  );
});

test('only the four reviewed signatures are covered', () => {
  const extra = `${SQL}\nCREATE OR REPLACE FUNCTION public.get_yearly_invoice_totals(_ws_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ select $$;\nCREATE OR REPLACE FUNCTION public.get_daily_invoice_totals(_ws_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ select $$;\n`;
  const result = run({ [FILE]: extra });
  assert.deepEqual(
    definerFailures(result).map(
      (item) => item.detail.match(/function (\S+)/)[1]
    ),
    [
      'public.get_yearly_invoice_totals(uuid)',
      'public.get_daily_invoice_totals(uuid)',
    ]
  );
  assert.equal(exceptions(result).length, 4);
});

test('a later PUBLIC or anon grant still fails a covered signature', () => {
  for (const role of ['public', 'anon']) {
    const result = run({
      [FILE]: SQL,
      'apps/database/supabase/migrations/20261030000000_reopen.sql': `-- allow-anon-grant: fixture\ngrant execute on function public.get_daily_invoice_totals(uuid, integer, uuid[], uuid[], date, date) to ${role};`,
    });
    const failures = definerFailures(result);
    assert.equal(failures.length, 1, role);
    assert.match(failures[0].detail, /get_daily_invoice_totals/);
    assert.equal(exceptions(result).length, 3);
  }
});

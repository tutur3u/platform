const assert = require('node:assert/strict');
const test = require('node:test');
const {
  collectDiagnostics,
  evaluateSqlFiles,
} = require('./sql-grant-guard-baseline');
const file = 'apps/database/supabase/migrations/20300101000000_parity.sql';
const signature = 'public.parity(uuid)';
const create = `create function public.parity(actor uuid) returns boolean language sql security definer set search_path=pg_catalog,pg_temp as $$select actor = auth.uid()$$;
revoke all on function ${signature} from public,anon,authenticated;`;
const marker = `-- tuturuuu: reviewed(function-grant): ${signature} anon-required review=parity-fixture`;
const grant = `grant execute on function ${signature} to PUBLIC;`;
const run = (sql, verifiedFindings = []) =>
  evaluateSqlFiles({ files: [file], readFile: () => sql, verifiedFindings });

test('reviewed PUBLIC re-grant after revoke uses full policy acceptance', () => {
  assert.deepEqual(run(`${create}\n${marker}\n${grant}`).violations, []);
});

test('different-signature marker and unmarked PUBLIC re-grants fail', () => {
  for (const review of ['', marker.replace('parity(uuid)', 'parity(text)')]) {
    const findings = run(`${create}\n${review}\n${grant}`).violations;
    assert.ok(findings.some((finding) => finding.rule === 'anon-grant'));
  }
});

test('verified re-grant evidence binds both source bytes and signature', () => {
  const sql = `${create}\n${grant}`;
  const input = { files: [file], readFile: () => sql };
  const entries = collectDiagnostics(input).map((finding) => ({
    path: file,
    line: finding.line,
    rule: finding.rule,
    digest: finding.digest,
    fileDigest: finding.fileDigest,
    reason: 'Fixture review',
  }));
  assert.ok(entries.length > 0);
  assert.deepEqual(run(sql, entries).violations, []);
  assert.ok(
    run(
      sql,
      entries.map((entry) => ({ ...entry, fileDigest: '0'.repeat(64) }))
    ).violations.length > 0
  );
  assert.ok(
    run(sql.replaceAll('parity(uuid)', 'parity(text)'), entries).violations
      .length > 0
  );
  assert.ok(run(`${sql}\n-- changed source`, entries).violations.length > 0);
});

test('unreviewed anon and PUBLIC execution of a body without caller binding fails', () => {
  const unsafe = create.replace('actor = auth.uid()', 'true');
  for (const role of ['anon', 'PUBLIC']) {
    const findings = run(
      `${unsafe}\n${grant.replace('PUBLIC', role)}`
    ).violations;
    assert.ok(findings.some((finding) => finding.rule === 'anon-grant'));
  }
});

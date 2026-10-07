import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { reviewRaceScripts } from './report-review-receipt-concurrency.mjs';

const require = createRequire(import.meta.url);
const {
  readWorkflow,
} = require('../../../scripts/ci/workflow-yaml-test-helper.js');
const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const migration = read(
  '../supabase/migrations/20261007090000_report_review_receipt_foundation.sql'
);
const fixture = read('../supabase/tests/report-review-receipts.sql');
const runner = read('./verify-report-review-receipts-contract.mjs');
const race = read('./report-review-receipt-concurrency.mjs');

test('two-connection scripts emit actual psql commands/newlines and target real row', () => {
  for (const readOnly of [false, true]) {
    const scripts = reviewRaceScripts({ readOnly });
    assert.match(
      scripts.holder,
      /begin;[\s\S]*update private\.external_user_monthly_reports/u
    );
    assert.ok(scripts.holder.includes('\n\\echo FIXTURE_READY\n'));
    assert.ok(scripts.competitor.startsWith('\\set VERBOSITY verbose\n'));
    assert.ok(!scripts.holder.includes('\\n'));
    assert.match(scripts.competitor, /statement_timeout='5s'/u);
    if (readOnly) assert.match(scripts.competitor, /for update; commit;/u);
    else assert.match(scripts.competitor, /review_revision=999/u);
  }
});
test('actual race proves lock wait before release, validates owned metadata and final versions', () => {
  assert.match(race, /wait_event_type='Lock'/u);
  assert.match(race, /Review competitor did not wait/u);
  assert.match(race, /admitted\.repositoryRoot, metadata\.repositoryRoot/u);
  assert.match(race, /admitted\.status, 'testing'/u);
  assert.match(
    race,
    /Two edits increment twice without caller-forged version/u
  );
  assert.match(race, /Locked read sees committed current version/u);
  assert.match(race, /finally[\s\S]*delete from public\.workspaces/u);
});
test('CI runner snapshots full schema, enforces strict TAP and real concurrency before type generation', () => {
  assert.match(runner, /git[\s\S]*ls-files[\s\S]*apps\/database\/supabase/u);
  assert.match(runner, /Isolated source snapshot mismatch/u);
  assert.match(runner, /assertStrictTap\(tap\)/u);
  assert.match(runner, /await runReportReviewConcurrency\(metadata\)/u);
  assert.match(runner, /typegenOutput = 'packages\/types\/src\/supabase\.ts'/u);
  assert.match(runner, /runIsolatedLifecycle/u);
});
test('workflow fails closed on disabled gate and selects exact head/schema paths', () => {
  const w = readWorkflow('report-review-receipts-contract.yaml');
  assert.equal(w.jobs['check-ci'].uses, './.github/workflows/ci-check.yml');
  assert.equal(
    w.jobs['check-ci'].with.workflow_name,
    'report-review-receipts-contract.yaml'
  );
  assert.equal(w.permissions.contents, 'read');
  assert.ok(
    w.on.pull_request.paths.includes('apps/database/supabase/migrations/**')
  );
  assert.deepEqual(w.on.push.branches, ['main', 'production']);
  for (const event of ['pull_request', 'push'])
    assert.ok(
      w.on[event].paths.includes(
        'apps/database/scripts/time-tracker-control-concurrency.mjs'
      )
    );
  const steps = w.jobs.contract.steps;
  assert.equal(steps[0].run, 'test "$CONTRACT_ENABLED" = true');
  assert.equal(
    steps.find((s) => s.uses === 'actions/checkout@v7').with.ref,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: compare the literal GitHub workflow expression.
    '${{ github.event.pull_request.head.sha || github.sha }}'
  );
  assert.equal(steps.at(-1).with['if-no-files-found'], 'error');
  assert.ok(
    steps.findIndex(
      (s) => s.name === 'Strictly check actual generated review types'
    ) >
      steps.findIndex(
        (s) =>
          s.name ===
          'Apply complete schema, run strict pgTAP, generate actual schema types'
      )
  );
  assert.match(
    steps.find((s) => s.name === 'Strictly check actual generated review types')
      .run,
    /--strict[\s\S]*report-review-receipts-types\.ts/u
  );
  assert.match(
    read('../../../tuturuuu.ci.ts'),
    /'report-review-receipts-contract.yaml': true/u
  );
});
test('receipt storage stays inert and schema snapshot retention cannot silently cascade', () => {
  assert.match(migration, /SELECT false;/u);
  assert.match(
    migration,
    /GRANT SELECT ON TABLE private\.report_review_receipts TO service_role/u
  );
  assert.ok(
    !/GRANT (?:INSERT|UPDATE|DELETE|ALL) ON TABLE private\.report_review_receipts/u.test(
      migration
    )
  );
  assert.ok(!/REFERENCES/u.test(migration));
  assert.match(migration, /BEFORE TRUNCATE/u);
  assert.equal((migration.match(/\^\[0-9a-f\]\{64\}\$/gu) || []).length, 2);
  assert.match(migration, /parent_review_revision IS NOT NULL/u);
});
test('real SQL controls include permission truth table, versions, overflow, teardown and no minting', () => {
  for (const expected of [
    'GUEST cannot borrow role grants',
    'MEMBER typed explicit default admitted',
    'same claimed link with foreign virtual workspace denied',
    'deleted actor cannot acquire new admission',
    'bookkeeping-only UPDATE cannot forge version',
    'bigint overflow fails closed',
    'daily parent revision runs after existing BEFORE triggers',
    'same action and entry cannot duplicate receipt',
    'tenant teardown is unblocked and preserves history',
    'ordinary source mutations minted no receipts',
  ])
    assert.ok(fixture.includes(expected), expected);
  assert.ok(fixture.includes('select no_plan();'));
  assert.ok(fixture.includes('select * from finish();'));
  assert.ok(fixture.trimEnd().endsWith('rollback;'));
});

test('fixtures provide historically required updated_at and review creator rewrite/clear', () => {
  for (const source of [fixture, race])
    assert.match(
      source,
      /insert into private\.external_user_monthly_reports\([^)]*updated_at[^)]*\)/u
    );
  assert.match(fixture, /creator_id=r\.creator_id/u);
  assert.match(
    fixture,
    /jsonb_build_object\('creator_id',pg_temp\.fid\(97101\)\)/u
  );
  assert.match(
    fixture,
    /jsonb_build_object\('creator_id',pg_temp\.fid\(97106\)\)/u
  );
  assert.ok(fixture.includes('{"creator_id":null}'));
  assert.match(migration, /'creator_id'/u);
});
test('row serialization is cached once after caller revision reset and before field loop', () => {
  assert.equal((migration.match(/to_jsonb\(NEW\)/gu) || []).length, 1);
  assert.equal((migration.match(/to_jsonb\(OLD\)/gu) || []).length, 1);
  assert.ok(
    migration.indexOf('NEW.review_revision := OLD.review_revision;') <
      migration.indexOf('new_row := to_jsonb(NEW);')
  );
  assert.ok(
    migration.indexOf('old_row := to_jsonb(OLD);') <
      migration.indexOf('FOREACH field_name')
  );
  assert.match(migration, /NEW\.review_revision := OLD\.review_revision \+ 1/u);
});

test('both SQL and race actor fixtures use the actual workspace user display column', () => {
  for (const source of [fixture, race]) {
    assert.match(
      source,
      /insert into public\.workspace_users\(id,ws_id,full_name\)/u
    );
    assert.doesNotMatch(
      source,
      /insert into public\.workspace_users\([^)]*\bname\b[^)]*\)/u
    );
  }
});

test('period mutation controls satisfy the actual historical paired-date constraint', () => {
  const historical = read(
    '../supabase/migrations/20260723172309_first_class_periodic_reports.sql'
  );
  assert.match(
    historical,
    /period_start is not null and period_end is not null and period_end >= period_start/u
  );
  assert.ok(
    fixture.includes(
      '{"cadence":"weekly","period_start":"2026-10-01","period_end":"2026-10-07"}'
    )
  );
  assert.ok(fixture.includes('{"period_start":"2026-10-02"}'));
  assert.ok(fixture.includes('{"period_end":"2026-10-08"}'));
  for (const control of [
    'one-sided period rejected by actual constraint',
    'reversed period rejected by actual constraint',
    'invalid periods leave revision unchanged',
  ])
    assert.ok(fixture.includes(control));
});

test('approval mutation supplies historically required actor and timestamp together', () => {
  const historical = read(
    '../supabase/migrations/20260202104019_report_post_approval_system.sql'
  );
  assert.match(
    historical,
    /report_approval_status = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL/u
  );
  assert.ok(
    fixture.includes(
      "jsonb_build_object('report_approval_status','APPROVED','approved_by',pg_temp.fid(97106),'approved_at','2026-10-06T00:00:00Z')"
    )
  );
  assert.doesNotMatch(
    fixture,
    /\('\{"report_approval_status":"APPROVED"\}'::jsonb\)/u
  );
  for (const control of [
    'approved status requires actor',
    'approved status requires timestamp',
    'pending status rejects leftover approval metadata',
    'invalid approval metadata leaves revision unchanged',
  ])
    assert.ok(fixture.includes(control));
});

test('readiness has a generated argument name while retaining inert identity and explicit strict flags', () => {
  assert.match(
    migration,
    /CREATE FUNCTION private\.report_review_delivery_ready\(p_report_id uuid\)\s*RETURNS boolean[\s\S]*?SELECT false;/u
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION private\.report_review_delivery_ready\(uuid\) TO service_role/u
  );
  const workflow = readWorkflow('report-review-receipts-contract.yaml');
  const command = workflow.jobs.contract.steps.find(
    (step) => step.name === 'Strictly check actual generated review types'
  ).run;
  assert.match(
    command,
    /tsc --ignoreConfig --noEmit --strict --skipLibCheck --target esnext --module nodenext --moduleResolution nodenext/u
  );
});

test('daily creator reassignment and clear invalidate parent version and prior receipt', () => {
  assert.match(
    migration,
    /ON private\.user_group_posts FOR EACH ROW[\s\S]*?'group_id', 'creator_id', 'post_approval_status'/u
  );
  for (const control of [
    'daily creator reassignment invalidates parent revision',
    'daily creator reassignment makes prior parent receipt stale',
    'daily creator clear invalidates parent revision',
  ])
    assert.ok(fixture.includes(control));
  assert.match(
    fixture,
    /receipt\.parent_review_revision <> post\.review_revision/u
  );
});

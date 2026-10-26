const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LEGACY_OWNERS,
  TARGETS,
} = require('./cloudflare-backend-ownership-allowlist');
const {
  MIGRATION_CUTOFF,
  checkRepository,
  evaluateOwnership,
  parsePgCronCalls,
  validateAllowlist,
} = require('./cloudflare-backend-ownership');

// Legacy owners at the time the rule was adopted (2026-10-23). The allowlist
// may only remove entries from this set; never add an id here.
const FROZEN_BASELINE = new Set([
  'cron-catalog:apps/infrastructure:calendar-provider-sync:*/15 * * * *',
  'cron-catalog:apps/infrastructure:calendar-smart-schedule:0 */6 * * *',
  'cron-catalog:apps/infrastructure:infrastructure-docker-recovery-alerts:*/5 * * * *',
  'cron-catalog:apps/infrastructure:infrastructure-sample-resources:* * * * *',
  'cron-catalog:apps/infrastructure:infrastructure-sync-trust-cache:*/10 * * * *',
  'cron-catalog:apps/web:calendar-provider-sync:*/15 * * * *',
  'cron-catalog:apps/web:calendar-smart-schedule:0 */6 * * *',
  'cron-catalog:apps/web:process-immediate-notifications:*/5 * * * *',
  'cron-catalog:apps/web:process-notification-batches:*/15 * * * *',
  'cron-catalog:apps/web:process-post-email-queue:*/30 * * * *',
  'cron-catalog:apps/web:process-topic-announcement-queue:*/15 * * * *',
  'cron-catalog:apps/web:tasks-deadline-reminders:0 */4 * * *',
  'next-after:apps/infrastructure/src/app/api/v1/infrastructure/ai-agents/[agentId]/channels/[channelId]/zalo-personal/route.ts',
  'next-after:apps/infrastructure/src/lib/inventory/commerce/polar-product-sync.ts',
  'next-after:apps/inventory/src/app/api/v1/inventory/square/webhook/[wsId]/route.ts',
  'next-after:apps/teach/src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/tests/[testId]/submissions/[attemptId]/ai-feedback/route.ts',
  'next-after:apps/web/src/app/api/v1/workspaces/[wsId]/notes/voice-jobs/route.ts',
  'next-after:apps/web/src/app/api/workspaces/[wsId]/accept-invite/route.ts',
  'next-after:apps/web/src/legacy-api-routes/v1/webhooks/ai-agents/[adapter]/[channelId]/route.ts',
  'next-after:apps/web/src/legacy-api-routes/workspaces/[wsId]/decline-invite/route.ts',
  'next-after:packages/inventory-core/src/lib/inventory/commerce/polar-product-sync-webhooks.ts',
  'next-cron-route:apps/calendar/src/app/api/cron/calendar/provider-sync/route.ts',
  'next-cron-route:apps/calendar/src/app/api/cron/calendar/smart-schedule/route.ts',
  'next-cron-route:apps/hive/src/app/api/cron/hive/simulate/route.ts',
  'next-cron-route:apps/infrastructure/src/app/api/cron/calendar/[job]/route.ts',
  'next-cron-route:apps/infrastructure/src/app/api/cron/infrastructure/docker-recovery-alerts/route.ts',
  'next-cron-route:apps/infrastructure/src/app/api/cron/infrastructure/sample-resources/route.ts',
  'next-cron-route:apps/infrastructure/src/app/api/cron/infrastructure/sync-trust-cache/route.ts',
  'next-cron-route:apps/inventory/src/app/api/cron/inventory/checkout-expiry/route.ts',
  'next-cron-route:apps/inventory/src/app/api/cron/inventory/polar-product-sync/route.ts',
  'next-cron-route:apps/pay/src/app/api/cron/payment/orders/route.ts',
  'next-cron-route:apps/pay/src/app/api/cron/payment/products/route.ts',
  'next-cron-route:apps/pay/src/app/api/cron/payment/subscriptions/route.ts',
  'next-cron-route:apps/tasks/src/app/api/cron/tasks/cleanup-media/route.ts',
  'next-cron-route:apps/tasks/src/app/api/cron/tasks/generate-embeddings/route.ts',
  'next-cron-route:apps/web/src/app/api/cron/ai/sync-models/route.ts',
  'next-cron-route:apps/web/src/app/api/cron/discord/daily-report/route.ts',
  'next-cron-route:apps/web/src/app/api/cron/discord/wol/daily/remind/route.ts',
  'next-cron-route:apps/web/src/app/api/cron/finance/exchange-rates/route.ts',
  'next-cron-route:apps/web/src/app/api/cron/process-immediate-notifications/route.ts',
  'next-cron-route:apps/web/src/app/api/cron/process-notification-batches/route.ts',
  'next-cron-route:apps/web/src/app/api/cron/process-post-email-queue/route.ts',
  'next-cron-route:apps/web/src/app/api/cron/process-report-automation/route.ts',
  'next-cron-route:apps/web/src/app/api/cron/process-topic-announcement-queue/route.ts',
  'next-cron-route:apps/web/src/app/api/cron/tasks/deadline-reminders/route.ts',
  'pg-cron:cleanup-rate-limits:*/15 * * * *',
  'pg-cron:fetch-exchange-rates:0 6 * * *',
  'pg-cron:hard-delete-soft-deleted-items:5 * * * *',
  'pg-cron:normalize-task-sort-keys:0 * * * *',
  'pg-cron:refresh-posts-dashboard:*/10 * * * *',
  'pg-cron:security-budget-cleanup:* * * * *',
  'pg-cron:unnamed:SELECT public.cleanup_old_typing_indicators():*/1 * * * *',
  'pg-cron:update_expired_sessions_job:* * * * *',
  'vercel-cron:apps/infrastructure:/api/cron/calendar/provider-sync:*/15 * * * *',
  'vercel-cron:apps/infrastructure:/api/cron/calendar/smart-schedule:0 */6 * * *',
  'vercel-cron:apps/infrastructure:/api/cron/infrastructure/docker-recovery-alerts:*/5 * * * *',
  'vercel-cron:apps/infrastructure:/api/cron/infrastructure/sample-resources:* * * * *',
  'vercel-cron:apps/infrastructure:/api/cron/infrastructure/sync-trust-cache:*/10 * * * *',
  'vercel-cron:apps/inventory:/api/cron/inventory/checkout-expiry:*/5 * * * *',
  'vercel-cron:apps/pay:/api/cron/payment/products:0 */12 * * *',
  'vercel-cron:apps/tasks:/api/cron/tasks/cleanup-media:17 3 * * *',
  'vercel-cron:apps/web:/api/cron/process-notification-batches:*/15 * * * *',
  'vercel-cron:apps/web:/api/cron/process-post-email-queue:*/30 * * * *',
  'vercel-cron:apps/web:/api/cron/process-report-automation:*/15 * * * *',
  'vercel-cron:apps/web:/api/cron/process-topic-announcement-queue:*/15 * * * *',
  'vercel-cron:apps/web:/api/cron/tasks/deadline-reminders:*/5 * * * *',
]);

const MIGRATIONS = 'apps/database/supabase/migrations';

function fixture(files) {
  return {
    files: Object.keys(files),
    readFile: (file) => {
      if (!(file in files)) throw new Error(`Missing fixture ${file}`);
      return files[file];
    },
  };
}

function evaluate(files, allowlist = []) {
  return evaluateOwnership({
    ...fixture(files),
    allowlist,
    migrationCutoff: '20261023000000',
  }).violations;
}

const allowedEntry = (id, target = TARGETS.cronTrigger) => ({
  id,
  owner: 'apps/example',
  target,
  plan: 'Fixture plan.',
  justification: target === TARGETS.retainPostgres ? 'x'.repeat(80) : '',
});

test('the repository adds no schedule or background owner outside Cloudflare', () => {
  assert.deepEqual(checkRepository().violations, []);
});

test('every legacy owner records an owner, Cloudflare target and plan', () => {
  assert.deepEqual(validateAllowlist(), []);
});

test('the legacy allowlist only shrinks from the adopted baseline', () => {
  const added = LEGACY_OWNERS.map((owner) => owner.id).filter(
    (id) => !FROZEN_BASELINE.has(id)
  );
  assert.deepEqual(added, [], 'new owners must target Cloudflare instead');
  assert.equal(MIGRATION_CUTOFF, '20261023000000');
});

test('only pure database maintenance is retained in pg_cron', () => {
  const retained = LEGACY_OWNERS.filter(
    (owner) => owner.target === TARGETS.retainPostgres
  );
  assert.ok(retained.every((owner) => owner.id.startsWith('pg-cron:')));
  assert.ok(
    LEGACY_OWNERS.some(
      (owner) =>
        owner.id === 'pg-cron:fetch-exchange-rates:0 6 * * *' &&
        owner.target === TARGETS.cronTrigger
    ),
    'pg_net HTTP schedules are not pure database maintenance'
  );
});

test('a new or re-cadenced vercel.json cron fails', () => {
  const vercel = (schedule) =>
    JSON.stringify({ crons: [{ path: '/api/cron/example', schedule }] });
  const id = 'vercel-cron:apps/example:/api/cron/example:*/5 * * * *';
  assert.match(
    evaluate({ 'apps/example/vercel.json': vercel('*/5 * * * *') })[0],
    /New vercel-cron owner outside Cloudflare.*Cron Control job/
  );
  assert.deepEqual(
    evaluate({ 'apps/example/vercel.json': vercel('*/5 * * * *') }, [
      allowedEntry(id),
    ]),
    []
  );
  assert.equal(
    evaluate({ 'apps/example/vercel.json': vercel('* * * * *') }, [
      allowedEntry(id),
    ]).length,
    2,
    'a cadence change is a new owner and leaves the old entry stale'
  );
});

test('enabled cron catalog jobs are schedule owners; disabled ones are not', () => {
  const catalog = (enabled) =>
    JSON.stringify({
      jobs: [
        { id: 'job', enabled, path: '/api/cron/x', schedule: '0 * * * *' },
      ],
    });
  assert.equal(
    evaluate({ 'apps/web/cron.config.json': catalog(true) }).length,
    1
  );
  assert.deepEqual(
    evaluate({ 'apps/web/cron.config.json': catalog(false) }),
    []
  );
});

test('removing a legacy owner without removing its entry fails as stale', () => {
  assert.match(
    evaluate({}, [allowedEntry('vercel-cron:apps/x:/api/cron/x:* * * * *')])[0],
    /Stale allowlist entry.*only shrinks/
  );
});

test('a new migration cannot add a pg_cron schedule', () => {
  const violations = evaluate({
    [`${MIGRATIONS}/20261101000000_new_job.sql`]:
      "select cron.schedule('new-job', '*/5 * * * *', 'select 1');",
  });
  assert.ok(violations.some((v) => /New pg-cron owner/.test(v)));
  assert.ok(
    violations.some((v) =>
      /20261101000000_new_job\.sql calls cron\.schedule/.test(v)
    )
  );
});

test('a new migration may only re-schedule a justified retained pg_cron job', () => {
  const files = {
    [`${MIGRATIONS}/20250101000000_old.sql`]:
      "select cron.schedule('kept', '* * * * *', 'select 1');" +
      "select cron.schedule('moving', '0 * * * *', 'select net.http_post()');",
    [`${MIGRATIONS}/20261101000000_retune.sql`]:
      "select cron.schedule('kept', '* * * * *', 'select 2');",
  };
  const allowlist = [
    allowedEntry('pg-cron:kept:* * * * *', TARGETS.retainPostgres),
    allowedEntry('pg-cron:moving:0 * * * *'),
  ];
  assert.deepEqual(evaluate(files, allowlist), []);
  files[`${MIGRATIONS}/20261102000000_bad.sql`] =
    "select cron.schedule('moving', '0 * * * *', 'select net.http_post()');";
  assert.equal(evaluate(files, allowlist).length, 1);
});

test('unscheduling a job in a later migration removes the live owner', () => {
  const files = {
    [`${MIGRATIONS}/20250101000000_add.sql`]:
      "select cron.schedule('gone', '* * * * *', 'select 1');",
    [`${MIGRATIONS}/20261101000000_remove.sql`]:
      "select cron.unschedule('gone');",
  };
  assert.deepEqual(evaluate(files), []);
});

test('pg_cron parsing follows comments, quoting and PL/pgSQL blocks', () => {
  const sql = `
    -- select cron.schedule('commented', '* * * * *', 'select 1');
    /* select cron.unschedule('blocked'); */
    comment on function x is 'not cron.schedule(''quoted'', ''* * * * *'', ''x'')';
    select cron.schedule('*/1 * * * *', 'SELECT public.cleanup()');
    do $outer$ begin
      if not exists (select 1) then
        perform cron.schedule(
          'named', -- trailing comment
          '0 6 * * *',
          $cron$ select net.http_post(url := 'https://example.test') $cron$
        );
      end if;
    end $outer$;
    select cron.schedule('dollar', '*/10 * * * *', $$select refresh();$$);
    select cron.unschedule(42);
    select cron.unschedule('named');
  `;
  assert.deepEqual(parsePgCronCalls(sql), [
    {
      type: 'schedule',
      name: 'unnamed:SELECT public.cleanup()',
      schedule: '*/1 * * * *',
    },
    { type: 'schedule', name: 'named', schedule: '0 6 * * *' },
    { type: 'schedule', name: 'dollar', schedule: '*/10 * * * *' },
    { type: 'unschedule', name: 'named' },
  ]);
});

test('Supabase Edge Functions fail in source and configuration', () => {
  assert.match(
    evaluate({ 'apps/database/supabase/functions/hello/index.ts': '' })[0],
    /New edge-function owner.*Cloudflare Worker/
  );
  assert.match(
    evaluate({
      'apps/database/supabase/config.toml':
        '[functions.hello]\nverify_jwt = true\n',
    })[0],
    /edge-function:apps\/database\/supabase\/config\.toml:hello/
  );
  assert.deepEqual(
    evaluate({
      'apps/database/supabase/config.toml': '[edge_runtime]\nenabled = true\n',
    }),
    []
  );
});

test('Trigger.dev configuration, dependencies and imports fail', () => {
  const sdk = ['@trigger', 'dev/sdk'].join('.');
  for (const files of [
    { 'packages/jobs/trigger.config.ts': 'export default {};' },
    {
      'packages/jobs/package.json': JSON.stringify({
        dependencies: { [sdk]: '4.0.0' },
      }),
    },
    { 'packages/jobs/src/task.ts': `import { task } from '${sdk}/v3';` },
    { 'apps/web/src/lib/jobs.js': `const { schedules } = require('${sdk}');` },
  ]) {
    assert.match(
      evaluate(files)[0],
      /New trigger-dev owner.*Cloudflare Workflows/
    );
  }
  assert.deepEqual(
    evaluate({
      'packages/trigger/package.json': JSON.stringify({ dependencies: {} }),
    }),
    []
  );
});

test('new Next after() continuations and cron processor routes fail', () => {
  assert.match(
    evaluate({
      'apps/web/src/app/api/example/route.ts':
        "import { after, NextResponse } from 'next/server';",
    })[0],
    /New next-after owner.*Queue consumer/
  );
  assert.match(
    evaluate({
      'apps/web/src/app/api/cron/example/route.ts':
        'export const GET = () => {};',
    })[0],
    /New next-cron-route owner.*Cloudflare Worker/
  );
  assert.deepEqual(
    evaluate({
      'apps/web/src/app/api/example/route.test.ts':
        "import { after } from 'next/server';",
      'apps/tanstack-web/src/app/api/cron/example/route.ts': '',
      'apps/web/src/app/api/example/other.ts':
        "import { NextResponse } from 'next/server';",
    }),
    [],
    'tests, paused runtimes and unrelated imports are not owners'
  );
});

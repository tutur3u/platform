// Legacy schedule and background-work owners that predate the Cloudflare
// backend-ownership rule. This list may only shrink: migrate an owner to
// Cloudflare, delete its legacy definition, then delete its entry here.
// See apps/docs/build/devops/cloudflare-backend-ownership.mdx.

const TARGETS = Object.freeze({
  cronTrigger: 'cron-trigger:existing-processor',
  workerProcessor: 'worker-processor',
  queueConsumer: 'queue-consumer',
  workflow: 'workflow',
  durableObject: 'durable-object',
  workerWaitUntil: 'worker-wait-until',
  retainPostgres: 'retain-postgres',
  retire: 'retire',
});

const JUSTIFIED_TARGETS = new Set([TARGETS.retainPostgres, TARGETS.retire]);

function entry(id, owner, target, plan, justification) {
  return Object.freeze({ id, owner, target, plan, justification });
}

function vercelCron(project, routePath, schedule, target, plan) {
  return entry(
    `vercel-cron:${project}:${routePath}:${schedule}`,
    project,
    target,
    plan
  );
}

const PURE_POSTGRES =
  'Pure in-database maintenance: the job runs one SQL statement against ' +
  'Postgres tables only, with no HTTP, storage or provider side effects. A ' +
  'Cloudflare trigger would add a Worker invocation and a service-key HTTP ' +
  'round trip per tick while executing the same SQL in the same database, ' +
  'so moving it adds cost and credential exposure without benefit.';

const LEGACY_OWNERS = Object.freeze([
  // Vercel Cron definitions (scheduler owner). Wave 1 moves the schedule into
  // apps/cron-control behind default-off flags; processors move afterwards.
  vercelCron(
    'apps/infrastructure',
    '/api/cron/infrastructure/sample-resources',
    '* * * * *',
    TARGETS.cronTrigger,
    'Cron Control job infrastructure-sample-resources; then decide retirement because the sampler reads the retired Docker host snapshot.'
  ),
  vercelCron(
    'apps/infrastructure',
    '/api/cron/infrastructure/docker-recovery-alerts',
    '*/5 * * * *',
    TARGETS.cronTrigger,
    'Cron Control job infrastructure-docker-recovery-alerts; retirement candidate once alert purpose is confirmed (Docker runner is retired).'
  ),
  vercelCron(
    'apps/infrastructure',
    '/api/cron/infrastructure/sync-trust-cache',
    '*/10 * * * *',
    TARGETS.cronTrigger,
    'Cron Control job infrastructure-sync-trust-cache; later a Worker processor writing the trust cache directly.'
  ),
  vercelCron(
    'apps/infrastructure',
    '/api/cron/calendar/provider-sync',
    '*/15 * * * *',
    TARGETS.cronTrigger,
    'Cron Control job calendar-provider-sync through the Infrastructure gateway; later a Queue consumer per workspace sync.'
  ),
  vercelCron(
    'apps/infrastructure',
    '/api/cron/calendar/smart-schedule',
    '0 */6 * * *',
    TARGETS.cronTrigger,
    'Cron Control job calendar-smart-schedule through the Infrastructure gateway; later a Workflow.'
  ),
  vercelCron(
    'apps/web',
    '/api/cron/process-notification-batches',
    '*/15 * * * *',
    TARGETS.cronTrigger,
    'Cron Control job web-notification-batches (batch claims stay authoritative); later a Queue consumer.'
  ),
  vercelCron(
    'apps/web',
    '/api/cron/process-post-email-queue',
    '*/30 * * * *',
    TARGETS.cronTrigger,
    'Cron Control job web-post-email-queue; later a Queue consumer.'
  ),
  vercelCron(
    'apps/web',
    '/api/cron/process-report-automation',
    '*/15 * * * *',
    TARGETS.cronTrigger,
    'Cron Control job web-report-automation; later a Queue consumer.'
  ),
  vercelCron(
    'apps/web',
    '/api/cron/process-topic-announcement-queue',
    '*/15 * * * *',
    TARGETS.cronTrigger,
    'Cron Control job web-topic-announcements; later a Queue consumer.'
  ),
  vercelCron(
    'apps/web',
    '/api/cron/tasks/deadline-reminders',
    '*/5 * * * *',
    TARGETS.cronTrigger,
    'Cron Control job web-deadline-reminders at the live */5 cadence.'
  ),
  vercelCron(
    'apps/inventory',
    '/api/cron/inventory/checkout-expiry',
    '*/5 * * * *',
    TARGETS.workerProcessor,
    'Cron Control job inventory-checkout-expiry; Worker processor calls the atomic expiry RPC directly.'
  ),
  vercelCron(
    'apps/pay',
    '/api/cron/payment/products',
    '0 */12 * * *',
    TARGETS.cronTrigger,
    'Cron Control job pay-products; later a Worker processor for the Polar catalog sync.'
  ),
  vercelCron(
    'apps/tasks',
    '/api/cron/tasks/cleanup-media',
    '17 3 * * *',
    TARGETS.cronTrigger,
    'Cron Control job tasks-cleanup-media; later a Worker processor with a durable workspace cursor.'
  ),

  // Cron catalogs feed sync-web-crons and the Infrastructure cron monitor.
  // Enabled entries are schedule definitions in their own right.
  ...[
    ['process-notification-batches', '*/15 * * * *', TARGETS.cronTrigger],
    ['process-immediate-notifications', '*/5 * * * *', TARGETS.cronTrigger],
    ['process-post-email-queue', '*/30 * * * *', TARGETS.cronTrigger],
    ['process-topic-announcement-queue', '*/15 * * * *', TARGETS.cronTrigger],
    ['calendar-provider-sync', '*/15 * * * *', TARGETS.cronTrigger],
    ['calendar-smart-schedule', '0 */6 * * *', TARGETS.cronTrigger],
    ['tasks-deadline-reminders', '0 */4 * * *', TARGETS.cronTrigger],
  ].map(([id, schedule, target]) =>
    entry(
      `cron-catalog:apps/web:${id}:${schedule}`,
      'apps/web',
      target,
      'Replace the catalog entry with the Cron Control job definition once its Cloudflare cutover completes.'
    )
  ),

  ...[
    ['infrastructure-sample-resources', '* * * * *'],
    ['infrastructure-docker-recovery-alerts', '*/5 * * * *'],
    ['infrastructure-sync-trust-cache', '*/10 * * * *'],
    ['calendar-provider-sync', '*/15 * * * *'],
    ['calendar-smart-schedule', '0 */6 * * *'],
  ].map(([id, schedule]) =>
    entry(
      `cron-catalog:apps/infrastructure:${id}:${schedule}`,
      'apps/infrastructure',
      TARGETS.cronTrigger,
      'Replace the catalog entry with the Cron Control job definition once its Cloudflare cutover completes.'
    )
  ),

  // Live pg_cron jobs after replaying every migration in order.
  entry(
    'pg-cron:update_expired_sessions_job:* * * * *',
    'apps/database (Nova)',
    TARGETS.retainPostgres,
    'Keep in pg_cron; review cadence with Nova owners.',
    `${PURE_POSTGRES} It closes expired Nova sessions with one UPDATE.`
  ),
  entry(
    'pg-cron:unnamed:SELECT public.cleanup_old_typing_indicators():*/1 * * * *',
    'apps/database (Chat)',
    TARGETS.retainPostgres,
    'Keep in pg_cron; name the job when it is next edited.',
    `${PURE_POSTGRES} It deletes stale typing-indicator rows.`
  ),
  entry(
    'pg-cron:normalize-task-sort-keys:0 * * * *',
    'apps/database (Tasks)',
    TARGETS.retainPostgres,
    'Keep in pg_cron.',
    `${PURE_POSTGRES} It renumbers task sort keys inside one transaction.`
  ),
  entry(
    'pg-cron:hard-delete-soft-deleted-items:5 * * * *',
    'apps/database (Tasks)',
    TARGETS.retainPostgres,
    'Keep in pg_cron; storage objects are handled by tasks-cleanup-media.',
    `${PURE_POSTGRES} It hard-deletes tasks and boards soft-deleted over 30 days ago.`
  ),
  entry(
    'pg-cron:refresh-posts-dashboard:*/10 * * * *',
    'apps/database (Posts)',
    TARGETS.retainPostgres,
    'Keep in pg_cron.',
    `${PURE_POSTGRES} It refreshes one materialized view.`
  ),
  entry(
    'pg-cron:fetch-exchange-rates:0 6 * * *',
    'apps/web (Finance)',
    TARGETS.cronTrigger,
    'Cron Control job finance-exchange-rates (POST); then unschedule the pg_net job in a new migration.'
  ),
  entry(
    'pg-cron:cleanup-rate-limits:*/15 * * * *',
    'apps/database (Security)',
    TARGETS.retainPostgres,
    'Keep in pg_cron.',
    `${PURE_POSTGRES} It deletes expired rate-limit windows.`
  ),
  entry(
    'pg-cron:security-budget-cleanup:* * * * *',
    'apps/database (Security)',
    TARGETS.retainPostgres,
    'Keep in pg_cron; the delete is already bounded to 20,000 rows per tick.',
    `${PURE_POSTGRES} It deletes expired security budget counters.`
  ),

  // Next.js after() continuations: background work with no durable owner.
  ...[
    [
      'apps/infrastructure/src/app/api/v1/infrastructure/ai-agents/[agentId]/channels/[channelId]/zalo-personal/route.ts',
      TARGETS.queueConsumer,
    ],
    [
      'apps/infrastructure/src/lib/inventory/commerce/polar-product-sync.ts',
      TARGETS.queueConsumer,
    ],
    [
      'apps/inventory/src/app/api/v1/inventory/square/webhook/[wsId]/route.ts',
      TARGETS.queueConsumer,
    ],
    [
      'apps/teach/src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/tests/[testId]/submissions/[attemptId]/ai-feedback/route.ts',
      TARGETS.queueConsumer,
    ],
    [
      'apps/web/src/app/api/v1/workspaces/[wsId]/notes/voice-jobs/route.ts',
      TARGETS.queueConsumer,
    ],
    [
      'apps/web/src/app/api/workspaces/[wsId]/accept-invite/route.ts',
      TARGETS.workerWaitUntil,
    ],
    [
      'apps/web/src/legacy-api-routes/v1/webhooks/ai-agents/[adapter]/[channelId]/route.ts',
      TARGETS.queueConsumer,
    ],
    [
      'apps/web/src/legacy-api-routes/workspaces/[wsId]/decline-invite/route.ts',
      TARGETS.workerWaitUntil,
    ],
    [
      'packages/inventory-core/src/lib/inventory/commerce/polar-product-sync-webhooks.ts',
      TARGETS.queueConsumer,
    ],
  ].map(([file, target]) =>
    entry(
      `next-after:${file}`,
      file.split('/').slice(0, 2).join('/'),
      target,
      target === TARGETS.workerWaitUntil
        ? 'Bounded best-effort notification; becomes ctx.waitUntil when the app is Worker-hosted.'
        : 'Durable work: persist a job and drain it from a Cloudflare Queue consumer.'
    )
  ),

  // Next.js cron processor routes. Existing processors may be scheduled by
  // Cron Control; new processors belong in a Worker instead.
  ...[
    ['apps/calendar', 'calendar/provider-sync'],
    ['apps/calendar', 'calendar/smart-schedule'],
    ['apps/hive', 'hive/simulate', TARGETS.retire],
    ['apps/infrastructure', 'calendar/[job]'],
    ['apps/infrastructure', 'infrastructure/docker-recovery-alerts'],
    ['apps/infrastructure', 'infrastructure/sample-resources'],
    ['apps/infrastructure', 'infrastructure/sync-trust-cache'],
    ['apps/inventory', 'inventory/checkout-expiry', TARGETS.workerProcessor],
    ['apps/inventory', 'inventory/polar-product-sync'],
    ['apps/pay', 'payment/orders'],
    ['apps/pay', 'payment/products'],
    ['apps/pay', 'payment/subscriptions'],
    ['apps/tasks', 'tasks/cleanup-media', TARGETS.workerProcessor],
    ['apps/tasks', 'tasks/generate-embeddings', TARGETS.queueConsumer],
    ['apps/web', 'ai/sync-models'],
    ['apps/web', 'discord/daily-report'],
    ['apps/web', 'discord/wol/daily/remind'],
    ['apps/web', 'finance/exchange-rates'],
    ['apps/web', 'process-immediate-notifications'],
    ['apps/web', 'process-notification-batches', TARGETS.queueConsumer],
    ['apps/web', 'process-post-email-queue', TARGETS.queueConsumer],
    ['apps/web', 'process-report-automation', TARGETS.queueConsumer],
    ['apps/web', 'process-topic-announcement-queue', TARGETS.queueConsumer],
    ['apps/web', 'tasks/deadline-reminders'],
  ].map(([project, route, target = TARGETS.cronTrigger]) =>
    entry(
      `next-cron-route:${project}/src/app/api/cron/${route}/route.ts`,
      project,
      target,
      target === TARGETS.retire
        ? 'Source-disabled Hive simulation; delete the route instead of scheduling it.'
        : 'Existing processor; see the background-work inventory for its migration wave.',
      target === TARGETS.retire
        ? 'The Web cron catalog keeps hive-simulate disabled and no scheduler may enable it.'
        : undefined
    )
  ),
]);

module.exports = { JUSTIFIED_TARGETS, LEGACY_OWNERS, TARGETS };

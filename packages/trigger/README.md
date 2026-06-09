# Trigger Helpers

`@tuturuuu/trigger` contains legacy/manual Trigger.dev task wrappers and
reusable Calendar sync helpers.

Production Calendar provider sync is not scheduled here. It runs from
`apps/web/cron.config.json` through `/api/cron/calendar/provider-sync` every 15
minutes, and that route calls the central workspace sync API with cron auth.

## Calendar Rules

- Do not add recurring Calendar `schedules.task` jobs in this package.
- Keep reusable sync-token and full-sync helpers available for OAuth/manual sync
  paths.
- Use `apps/web/cron.config.json` as the source of truth for Calendar provider
  cadence, then sync `apps/web/vercel.json` with `node scripts/sync-web-crons.js`.

## Useful Files

- `src/google-calendar-sync.ts`: shared Google event formatting, batching, and
  sync-token helpers.
- `src/google-calendar-full-sync.ts`: manual/full-sync task wrapper plus the
  `performFullSyncForWorkspace` helper used by OAuth and manual full sync.
- `src/google-calendar-incremental-sync.ts`: manual incremental-sync task
  wrapper.
- `src/unified-schedule.ts`: manual unified scheduling task wrappers.
- `src/schedule-tasks.ts`: manual task-scheduling task wrapper.

## Local Testing

```bash
bun run --filter @tuturuuu/trigger test
```

Use `bun trigger:dev` or `bun trigger:deploy` only for workflows that still
intentionally run on Trigger.dev. They are not part of production Calendar cron
operations.

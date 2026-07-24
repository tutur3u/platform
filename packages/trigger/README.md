# Calendar And Scheduling Helpers

`@tuturuuu/trigger` contains reusable Calendar provider-sync and scheduling
helpers. Despite the historical package name, it has no Trigger.dev runtime or
SDK dependency.

Production recurring work is owned by Vercel Cron. Calendar provider sync runs
from `apps/web/cron.config.json` through
`/api/cron/calendar/provider-sync` every 15 minutes, and that route calls the
central workspace sync API with cron auth.

## Calendar Rules

- Do not add provider-specific schedulers or task-runner wrappers in this
  package.
- Keep reusable sync-token and full-sync helpers available for OAuth/manual sync
  paths.
- Use `apps/web/cron.config.json` as the source of truth for Calendar provider
  cadence, then sync `apps/web/vercel.json` with `node scripts/sync-web-crons.js`.

## Useful Files

- `src/google-calendar-sync.ts`: shared Google event formatting, batching, and
  sync-token helpers.
- `src/google-calendar-full-sync.ts`: full-sync helper used by OAuth and manual
  full sync.
- `src/google-calendar-incremental-sync.ts`: incremental-sync helper.
- `src/unified-schedule-helper.ts`: unified scheduling orchestration.
- `src/schedule-tasks-helper.ts`: task scheduling orchestration.

## Local Testing

```bash
bun run --filter @tuturuuu/trigger test
```

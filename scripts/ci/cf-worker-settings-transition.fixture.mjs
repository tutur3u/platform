import { readFileSync } from 'node:fs';

const recorded = JSON.parse(
  readFileSync(
    new URL('./fixtures/cf-worker-parity/cron-control.json', import.meta.url),
    'utf8'
  )
);
const live = recorded.previousIdentity ?? recorded.identity;
// The account id var is dropped because snapshots print the account id itself.
const {
  CLOUDFLARE_ACCOUNT_ID: _accountId,
  CRON_CONTROL_WEB_MODE: _webMode,
  TASKS_RECURRENCE_MODE: _recurrenceMode,
  ...liveVars
} = live.vars;

// Settings regressions run against the dormant, dashboard-admitted Cron
// Control identity, so they do not move with each recorded live transition.
// Artifact parity and cron order are pinned against the real fixture.
export const LIVE = {
  ...live,
  vars: {
    ...liveVars,
    CRON_CONTROL_ENABLED_JOBS:
      'database-cron-history-retention,ai-studio-retention',
  },
};

export const BASELINE = {
  identity: {
    ...LIVE,
    vars: { ...LIVE.vars, CRON_CONTROL_WEB_MODE: 'active' },
  },
  previousIdentity: LIVE,
  transition: {
    decision:
      'DASHBOARD-ADMISSION-1: regression fixture for a dashboard-admitted vars transition',
    fields: ['vars'],
  },
  dashboardAdmission: recorded.dashboardAdmission,
};

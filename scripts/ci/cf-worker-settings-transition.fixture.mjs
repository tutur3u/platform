import assert from 'node:assert/strict';
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
  secrets: [
    'CRON_CONTROL_DELIVERY_TOKEN',
    'CRON_CONTROL_OPERATOR_TOKEN',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_URL',
  ],
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
  dashboardAdmission: {
    versionId: 'dbe3ed29-0d78-47fe-908e-0095c689f68d',
    decision: 'CRON-DASH-ADMIT-1: exact version fixture for preflight',
  },
};

/** Cloudflare settings bindings for a recorded identity. */
export function bindingsFor(identity) {
  return [
    ...Object.entries(identity.vars).map(([name, text]) => ({
      name,
      type: 'plain_text',
      text,
    })),
    ...identity.secrets.map((name) => ({ name, type: 'secret_text' })),
    ...Object.entries(identity.durableObjects).map(([name, { className }]) => ({
      name,
      type: 'durable_object_namespace',
      class_name: className,
      namespace_id: `namespace-${className}`,
    })),
  ];
}

/** Fake read-only API whose live Worker matches `identity` (plus overrides). */
export function liveWorker(identity, { settings = {}, ...overrides } = {}) {
  const responses = {
    service: {
      default_environment: { script: { last_deployed_from: 'cf' } },
    },
    settings: {
      compatibility_date: identity.compatibilityDate,
      compatibility_flags: identity.compatibilityFlags,
      usage_model: 'standard',
      observability: {
        enabled: true,
        head_sampling_rate: 0.05,
        ...(identity.observability.traces && {
          traces: { enabled: false, head_sampling_rate: 0.05, persist: true },
        }),
      },
      bindings: bindingsFor(identity),
      ...settings,
    },
    subdomain: {
      enabled: identity.workersDev,
      previews_enabled: identity.previewUrls,
    },
    schedules: { schedules: identity.crons.map((cron) => ({ cron })) },
    secrets: identity.secrets.map((name) => ({ name })),
    domains: [],
    zones: [],
    deployments: {
      deployments: [
        { id: 'live', versions: [{ version_id: 'v', percentage: 100 }] },
      ],
    },
    ...overrides,
  };
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      assert.equal(init.method, 'GET');
      calls.push(url);
      const key = url.includes('/workers/services/')
        ? 'service'
        : url.includes('/zones?')
          ? 'zones'
          : url.split('/').at(-1);
      assert.ok(Object.hasOwn(responses, key), `unexpected endpoint ${url}`);
      return {
        ok: true,
        json: async () => ({ success: true, result: responses[key] }),
      };
    },
  };
}

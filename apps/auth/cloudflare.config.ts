import { bindings, defineConfig, exports } from 'cf/config';

// The first-party session's auth Worker (slice 4a, first cut). Dark: no
// routes, no custom domains, no workers.dev and no preview URLs, and no CI
// workflow publishes it. Callers reach it only through service bindings to
// named entry points, each checked with its own caller key. No secret is
// provisioned by this change; `TTR_SESSION_ENV` stays `local` until the
// release authority's staging change.
export default defineConfig({
  accountId: 'e8912e2867beecc673d171907bf09649',
  worker: {
    name: 'tuturuuu-auth',
    compatibilityDate: '2026-09-28',
    entrypoint: 'src/worker.ts',
    workersDev: false,
    previewUrls: false,
    observability: {
      enabled: true,
      headSamplingRate: 0.05,
      logs: { enabled: true, headSamplingRate: 0.05, invocationLogs: true },
    },
    env: {
      TTR_SESSION_ENV: bindings.text('local'),
      // Break-glass minimum fence mode; empty is `running`, a mistyped value
      // is `stopped`.
      TTR_SESSION_FENCE_FLOOR: bindings.text(''),
      // Empty uses the defaults in src/budget-store.ts.
      TTR_SESSION_DAILY_BUDGETS: bindings.text(''),
      TTR_SESSION_ENTRY_CONTROL_KEY: bindings.secret(),
      SESSION_CONTROL: bindings.durableObject({
        worker: 'tuturuuu-auth',
        exportName: 'SessionControl',
      }),
      SESSION_BUDGET: bindings.durableObject({
        worker: 'tuturuuu-auth',
        exportName: 'SessionBudget',
      }),
    },
    exports: {
      SessionControl: exports.durableObject({ storage: 'sqlite' }),
      SessionBudget: exports.durableObject({ storage: 'sqlite' }),
    },
  },
});

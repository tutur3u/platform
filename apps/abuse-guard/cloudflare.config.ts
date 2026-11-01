import { bindings, defineConfig, exports } from 'cf/config';

// Abuse-guard store: authenticated RPC over SQLite Durable Objects. Not yet
// published. workers.dev, preview URLs and routes stay off; the owner attaches
// a custom hostname and secrets during the admitted staging publication.
// `GuardSubject` partitions are keyed by client-side HMAC digests only.
export default defineConfig({
  accountId: 'e8912e2867beecc673d171907bf09649',
  worker: {
    name: 'tuturuuu-abuse-guard',
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
      ABUSE_GUARD_DAILY_OP_BUDGET: bindings.text('1000000'),
      // Optional explicit split, e.g. `offline=600000,replay=100000`; empty
      // uses the default shares (offline 50%, proxy 20%, replay/password/meet
      // 10% each).
      ABUSE_GUARD_FAMILY_BUDGETS: bindings.text(''),
      ABUSE_GUARD_LOCATION_HINT: bindings.text('apac'),
      ABUSE_GUARD_SECRETS: bindings.secret(),
      ABUSE_GUARD_OPERATOR_TOKEN: bindings.secret(),
      GUARD_SUBJECT: bindings.durableObject({
        worker: 'tuturuuu-abuse-guard',
        exportName: 'GuardSubject',
      }),
      GUARD_CONTROL: bindings.durableObject({
        worker: 'tuturuuu-abuse-guard',
        exportName: 'GuardControl',
      }),
    },
    exports: {
      GuardSubject: exports.durableObject({ storage: 'sqlite' }),
      GuardControl: exports.durableObject({ storage: 'sqlite' }),
    },
  },
});

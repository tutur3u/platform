import { bindings, defineConfig, exports } from 'cf/config';

// Mastermind store: one SQLite Durable Object holding the live fleet
// snapshot, owner answers and push-event claims for apps/web. Authenticated
// RPC only; workers.dev and preview URLs stay off, and the owner attaches the
// custom hostname and secrets at publication. A second SQLite Durable Object,
// the fleet bridge, holds the orchestrator machine's hibernatable WebSocket
// and the outbox of undelivered thread replies. No alarms, crons or queues.
export default defineConfig({
  accountId: 'e8912e2867beecc673d171907bf09649',
  worker: {
    name: 'tuturuuu-mastermind-store',
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
      MASTERMIND_STORE_DAILY_WRITE_BUDGET: bindings.text('50000'),
      MASTERMIND_STORE_TOKENS: bindings.secret(),
      MASTERMIND_STORE_OPERATOR_TOKEN: bindings.secret(),
      MASTERMIND_STORE_METRICS: bindings.analyticsEngineDataset({
        name: 'mastermind_store',
      }),
      MASTERMIND_STORE: bindings.durableObject({
        worker: 'tuturuuu-mastermind-store',
        exportName: 'MastermindStore',
      }),
      // Fleet bridge: billable operations (tickets, replies, pokes) per UTC day.
      MASTERMIND_BRIDGE_DAILY_OPS: bindings.text('20000'),
      MASTERMIND_BRIDGE: bindings.durableObject({
        worker: 'tuturuuu-mastermind-store',
        exportName: 'FleetBridge',
      }),
    },
    exports: {
      MastermindStore: exports.durableObject({ storage: 'sqlite' }),
      FleetBridge: exports.durableObject({ storage: 'sqlite' }),
    },
  },
});

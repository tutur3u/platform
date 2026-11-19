import { bindings, defineConfig, exports, triggers } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'tuturuuu-ops-hub',
    compatibilityDate: '2026-10-19',
    entrypoint: 'src/worker.ts',
    workersDev: true,
    previewUrls: false,
    observability: { enabled: false },
    env: {
      OPS_HUB_GATEWAY_SECRET: bindings.secret(),
      OPS_HUB_PUBLISHER_PUBLIC_KEY: bindings.secret(),
      OPS_HUB_ALLOWED_USER_IDS: bindings.secret(),
      BOARD_PUBLIC_KEY_A: bindings.secret(),
      BOARD_PUBLIC_KEY_B: bindings.secret(),
      BOARD_STATE_SECRET: bindings.secret(),
      BOARD_TASKS_SCOPE: bindings.secret(),
      BOARD_TASKS_ORIGIN: bindings.secret(),
      BOARD_TASKS_TOKEN: bindings.secret(),
      BOARD_FOLLOWUPS: bindings.queue<import('./src/board/contracts').Job>({
        name: 'tuturuuu-board-followups',
      }),
      BOARD: bindings.durableObject({
        worker: 'tuturuuu-ops-hub',
        exportName: 'FleetBoard',
      }),
      HUB: bindings.durableObject({
        worker: 'tuturuuu-ops-hub',
        exportName: 'OpsHub',
      }),
    },
    exports: {
      OpsHub: exports.durableObject({ storage: 'sqlite' }),
      FleetBoard: exports.durableObject({ storage: 'sqlite' }),
    },
    triggers: [
      triggers.queue({
        name: 'tuturuuu-board-followups',
        maxBatchSize: 10,
        maxRetries: 0,
      }),
    ],
  },
});

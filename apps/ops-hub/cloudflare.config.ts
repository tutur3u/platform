import { bindings, defineConfig, exports } from 'cf/config';

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
      HUB: bindings.durableObject({
        worker: 'tuturuuu-ops-hub',
        exportName: 'OpsHub',
      }),
    },
    exports: { OpsHub: exports.durableObject({ storage: 'sqlite' }) },
  },
});

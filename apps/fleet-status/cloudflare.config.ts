import { bindings, defineConfig, exports } from 'cf/config';

export default defineConfig({
  accountId: 'e8912e2867beecc673d171907bf09649',
  worker: {
    name: 'tuturuuu-fleet-status',
    compatibilityDate: '2026-09-28',
    entrypoint: 'src/worker.ts',
    workersDev: false,
    previewUrls: false,
    env: {
      FLEET_STATUS_ENABLED: bindings.text('false'),
      FLEET_STATUS_REPOS: bindings.text(''),
      GITHUB_WEBHOOK_SECRET: bindings.secret(),
      FLEET_STATUS_READ_TOKEN: bindings.secret(),
      FLEET_STATUS_OPERATOR_TOKEN: bindings.secret(),
      FLEET_STATUS_GITHUB_TOKEN: bindings.secret(),
      FLEET_STATUS_STATE: bindings.durableObject({
        worker: 'tuturuuu-fleet-status',
        exportName: 'FleetStatusState',
      }),
    },
    exports: {
      FleetStatusState: exports.durableObject({ storage: 'sqlite' }),
    },
  },
});

import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  accountId: 'e8912e2867beecc673d171907bf09649',
  worker: {
    name: 'tuturuuu-api',
    entrypoint: 'src/worker.ts',
    compatibilityDate: '2026-06-20',
    compatibilityFlags: ['nodejs_compat'],
    workersDev: false,
    previewUrls: false,
    observability: {
      enabled: true,
      headSamplingRate: 0.05,
      logs: { enabled: true, headSamplingRate: 0.05, invocationLogs: false },
    },
    limits: { cpuMs: 50 },
    env: {
      API_WORKER_OPERATIONS: bindings.secret(),
      MOBILE_VERSION_POLICY: bindings.secret(),
    },
  },
});

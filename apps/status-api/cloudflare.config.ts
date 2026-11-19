import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  accountId: 'e8912e2867beecc673d171907bf09649',
  worker: {
    name: 'tuturuuu-status-api',
    entrypoint: 'src/worker.ts',
    compatibilityDate: '2026-06-20',
    workersDev: false,
    previewUrls: false,
    observability: {
      enabled: true,
      headSamplingRate: 0.05,
      logs: { enabled: true, headSamplingRate: 0.05, invocationLogs: true },
    },
    limits: { cpuMs: 10 },
    env: {
      STATUS_SNAPSHOTS: bindings.kv({}),
      STATUS_PUBLIC_COMPONENT_IDS: bindings.text(''),
      STATUS_CLIENT_CONSENT_IDS: bindings.text(''),
    },
  },
});

import { bindings, defineConfig, triggers } from 'cf/config';

export default defineConfig({
  accountId: 'e8912e2867beecc673d171907bf09649',
  worker: {
    name: 'tuturuuu-gateway',
    entrypoint: 'src/worker.ts',
    compatibilityDate: '2026-09-28',
    workersDev: false,
    previewUrls: false,
    observability: {
      enabled: true,
      headSamplingRate: 0.01,
      logs: { enabled: true, headSamplingRate: 0.01, invocationLogs: true },
    },
    limits: { cpuMs: 50 },
    triggers: [
      triggers.fetch({ pattern: 'tuturuuu.com/*', zone: 'tuturuuu.com' }),
    ],
    env: {
      GATEWAY_MODE: bindings.text('active'),
      PUBLIC_HOST: bindings.text('tuturuuu.com'),
      GATEWAY_MARKETING_GROUPS: bindings.text(
        'legal,company,products,solutions,blog,home'
      ),
      GATEWAY_MARKETING_LEGACY_ROBOTS: bindings.text('1'),
      GATEWAY_RESPECT_ORIGIN_CACHE_CONTROL: bindings.text('false'),
      GATEWAY_MOUNTED_PATHS: bindings.text(''),
    },
  },
});

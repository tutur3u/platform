import { bindings, defineConfig, exports } from 'cf/config';

// Self-hosted Turborepo remote cache. Deployment identity for the cf CLI.
// Nothing here enables the cache: TURBO_CACHE_MODE defaults to `off`, and the
// owner flips it per the runbook (apps/docs/build/devops/turbo-remote-cache.mdx)
// after creating the bucket, lifecycle rule and secrets.
export default defineConfig({
  accountId: 'e8912e2867beecc673d171907bf09649',
  worker: {
    name: 'tuturuuu-turbo-cache',
    compatibilityDate: '2026-09-28',
    entrypoint: 'src/worker.ts',
    workersDev: false,
    domains: ['turbo-cache.tuturuuu.com'],
    limits: { cpuMs: 1000, subrequests: 208 },
    observability: { enabled: true, headSamplingRate: 0.01 },
    exports: {
      TurboCacheBudget: exports.durableObject({ storage: 'sqlite' }),
    },
    env: {
      ARTIFACTS: bindings.r2({ name: 'tuturuuu-turbo-cache' }),
      BUDGET: bindings.durableObject({
        worker: 'tuturuuu-turbo-cache',
        exportName: 'TurboCacheBudget',
      }),
      // 600 requests per token per 10 s: ingress smoothing only. The
      // Durable snapshot bounds admissions; ingress still costs control reads.
      REQUEST_LIMITER: bindings.rateLimit({
        namespace: '4207',
        simple: { limit: 600, period: 10 },
      }),
      TURBO_CACHE_MODE: bindings.text('off'),
      TURBO_CACHE_REQUIRE_SIGNATURE: bindings.text('true'),
      TURBO_CACHE_TTL_DAYS: bindings.text('7'),
      TURBO_CACHE_MAX_ARTIFACT_BYTES: bindings.text('104857600'),
      TURBO_CACHE_DAILY_CLASS_A: bindings.text('100000'),
      TURBO_CACHE_DAILY_CLASS_B: bindings.text('1000000'),
      TURBO_CACHE_DAILY_WRITE_BYTES: bindings.text('21474836480'),
      TURBO_CACHE_MONTHLY_CLASS_A_FENCE: bindings.text('2000000'),
      TURBO_CACHE_TOKENS: bindings.secret(),
      TURBO_CACHE_ADMIN_TOKEN_SHA256: bindings.secret(),
    },
  },
});

import { bindings, defineConfig, defineWorker } from 'cf/config';

// Route-free vinext Worker for apps/web: the whole app, or one route family
// from cloudflare/vinext/families.json when WEB_VINEXT_FAMILY is set. It has
// no workers.dev or preview URL; traffic can only reach it through an explicit
// gateway binding.
const family = process.env.WEB_VINEXT_FAMILY?.trim();
// build-family.sh sets the build commit; the service-worker URL uses it as
// its cache-buster.
const deploymentStamp = process.env.PLATFORM_DEPLOYMENT_STAMP?.trim();

// Names only. Values come from deployment secrets, or `.dev.vars` locally.
const runtimeVariables = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'ROOT_WORKSPACE_ID',
  'TUTURUUU_DEPLOY_ENV',
  'TUTURUUU_APP_COORDINATION_SECRET',
  'ABUSE_GUARD_KEY_PEPPER',
] as const;

export default defineConfig({
  worker: defineWorker({
    name: family ? `tuturuuu-web-vinext-${family}` : 'tuturuuu-web-vinext',
    entrypoint: './cloudflare/vinext/worker-entry.ts',
    compatibilityDate: '2026-11-21',
    // Same-zone fetches (for example rewrites to calendar.tuturuuu.com or
    // server calls to tuturuuu.com) must run through the public path so
    // zone Worker routes apply instead of reaching the DNS origin.
    compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workersDev: false,
    previewUrls: false,
    // The API families call the Gemini API, which rejects requests from
    // unsupported locations such as Hong Kong, the edge most Vietnamese
    // traffic reaches. Running them in Singapore keeps that egress in a
    // supported region and beside the Supabase database.
    ...(!family || family.startsWith('api-')
      ? { placement: { region: 'aws:ap-southeast-1' } }
      : {}),
    // Every request and its console output stay queryable in Workers Logs;
    // a deploy applies this, so it is not lost on redeploy.
    observability: {
      enabled: true,
      headSamplingRate: 1,
      logs: { enabled: true, headSamplingRate: 1, invocationLogs: true },
    },
    assets: {
      htmlHandling: 'none',
      notFoundHandling: 'none',
      runWorkerFirst: [
        '/*',
        '!/_next/static/*',
        '!/*/_next/static/*',
        // Family client assets (assetPrefix /_f/<id>).
        '!/_f/*/_next/static/*',
      ],
    },
    env: {
      ASSETS: bindings.assets(),
      // Cloudflare Images for the ImageTransformer (profile media, feedback
      // images, external project assets).
      IMAGES: bindings.images(),
      // Abuse-guard, rate-limit and native-integrity state (no Redis client).
      ABUSE_GUARD: bindings.worker({
        worker: 'tuturuuu-abuse-guard',
        exportName: 'AbuseGuardEntrypoint',
      }),
      ABUSE_GUARD_FAMILIES: bindings.text('proxy,ratelimit,integrity'),
      // Cron Control has no public ingress. api-core serves Mastermind Ship's
      // Check now and relays it over this binding; Cron Control still checks
      // the MASTERMIND_SHIP_CHECK_TOKEN bearer.
      CRON_CONTROL:
        (!family || family === 'api-core') &&
        bindings.worker({ worker: 'tuturuuu-cron-control' }),
      // Private per-user ChatGPT credential stores for the api-ops routes
      // under /api/ai/chatgpt and /api/v1/users/chatgpt.
      CHATGPT_FILES:
        (!family || family === 'api-ops') &&
        bindings.r2({ name: 'tuturuuu-web-chatgpt-files' }),
      NATIVE_INTEGRITY_STORE: bindings.text('abuse-guard'),
      APP_COORDINATION_TOKEN_DISABLE_SUPABASE_FALLBACK: bindings.text('1'),
      // Client IP comes only from cf-connecting-ip.
      TRUSTED_PROXY: bindings.text('cloudflare'),
      TUTURUUU_SERVICE_NAME: bindings.text(
        family ? `web-vinext-${family}` : 'web-vinext'
      ),
      PLATFORM_DEPLOYMENT_STAMP: deploymentStamp
        ? bindings.text(deploymentStamp)
        : false,
      ...Object.fromEntries(
        runtimeVariables.map((name) => [name, bindings.secret()])
      ),
    },
  }),
});

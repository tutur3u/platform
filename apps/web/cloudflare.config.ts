import { bindings, defineConfig, defineWorker } from 'cf/config';

// Route-free vinext Worker for apps/web: the whole app, or one route family
// from cloudflare/vinext/families.json when WEB_VINEXT_FAMILY is set. It has
// no workers.dev or preview URL; traffic can only reach it through an explicit
// gateway binding.
const family = process.env.WEB_VINEXT_FAMILY?.trim();

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
    entrypoint: 'vinext/server/fetch-handler',
    compatibilityDate: '2026-11-21',
    compatibilityFlags: ['nodejs_compat'],
    workersDev: false,
    previewUrls: false,
    assets: {
      htmlHandling: 'none',
      notFoundHandling: 'none',
      runWorkerFirst: ['/*', '!/_next/static/*', '!/*/_next/static/*'],
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
      NATIVE_INTEGRITY_STORE: bindings.text('abuse-guard'),
      APP_COORDINATION_TOKEN_DISABLE_SUPABASE_FALLBACK: bindings.text('1'),
      // Client IP comes only from cf-connecting-ip.
      TRUSTED_PROXY: bindings.text('cloudflare'),
      TUTURUUU_SERVICE_NAME: bindings.text(
        family ? `web-vinext-${family}` : 'web-vinext'
      ),
      ...Object.fromEntries(
        runtimeVariables.map((name) => [name, bindings.secret()])
      ),
    },
  }),
});

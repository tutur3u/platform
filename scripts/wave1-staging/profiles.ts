// Public production identifier pinned by supabase-production.yaml; never a credential.
export const productionSupabaseProjectRefs: readonly string[] = [
  'nzamlzqfdwaaxdefwraj',
];
export const stagingApps = ['meet', 'calendar', 'mail', 'apps'] as const;
export type StagingApp = (typeof stagingApps)[number];
export const stagingWebOrigin = 'https://web.tutur3u.com';
export const stagingCookieDomain = '.staging.tutur3u.com';
const requiredSecrets = {
  meet: ['MEET_REALTIME_TOKEN_SECRET', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  calendar: [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'MICROSOFT_CLIENT_ID',
    'MICROSOFT_CLIENT_SECRET',
    'MICROSOFT_TENANT_ID',
    'CRON_SECRET',
  ],
  mail: [
    'MAIL_CONNECTED_ACCOUNTS_KEY',
    'MAIL_R2_ACCOUNT_ID',
    'MAIL_R2_ACCESS_KEY_ID',
    'MAIL_R2_SECRET_ACCESS_KEY',
    'MAIL_CLOUDFLARE_ACCOUNT_ID',
    'MAIL_CLOUDFLARE_API_TOKEN',
    'MAIL_CLOUDFLARE_INGEST_SECRET',
  ],
  apps: [],
};
export function stagingHost(app: StagingApp) {
  return `${app}.tutur3u.com`;
}
export function stagingBuildInputs(
  env: Record<string, string | undefined>,
  app: StagingApp
) {
  const ref = env.WAVE1_STAGING_SUPABASE_PROJECT_REF;
  const productionRef = env.WAVE1_PRODUCTION_SUPABASE_PROJECT_REF;
  if (
    !ref ||
    !productionRef ||
    !/^[a-z0-9]{20}$/u.test(ref) ||
    !/^[a-z0-9]{20}$/u.test(productionRef) ||
    ref === productionRef ||
    productionSupabaseProjectRefs.includes(ref) ||
    env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`
  ) {
    throw new Error(
      'Require distinct reviewed staging/production project refs and staging Supabase URL'
    );
  }
  if (
    env.NEXT_PUBLIC_APP_URL !== `https://${stagingHost(app)}` ||
    env.NEXT_PUBLIC_WEB_APP_URL !== stagingWebOrigin ||
    env.NEXT_PUBLIC_TUTURUUU_STAGING !== '1'
  ) {
    throw new Error(
      'Require exact staging public origins and staging registry at build time'
    );
  }
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    throw new Error('Require staging public Supabase key');
  return { ref, productionRef };
}
export function hostedStagingProfile(app: StagingApp, inputs: { ref: string }) {
  const origin = `https://${stagingHost(app)}`;
  return {
    target: 'cloudflare' as const,
    inference: {
      bindings: {
        db: false,
        kv: false,
        storage: false,
        ai: false,
        email: false,
      },
      scanDirs: [],
      build: 'vp build',
    },
    cloudflare: {
      name: `tuturuuu-${app}-hosted-staging`,
      main: 'cloudflare/hosted-staging-worker.ts',
      compatibility_date:
        app === 'meet'
          ? '2026-09-06'
          : app === 'apps'
            ? '2026-10-12'
            : '2026-10-19',
      compatibility_flags:
        app === 'apps'
          ? ['nodejs_compat']
          : ['nodejs_compat', 'global_fetch_strictly_public'],
      secrets: {
        required: [
          'NEXT_PUBLIC_SUPABASE_URL',
          'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
          'SUPABASE_SECRET_KEY',
          'TUTURUUU_APP_COORDINATION_SECRET',
          'WAVE1_STAGING_SERVING_ENABLED',
          ...requiredSecrets[app],
        ],
      },
      workers_dev: false,
      preview_urls: false,
      // Route patterns require pre-existing operator-owned DNS. No custom_domain:
      // uploading this profile must never implicitly create a DNS record.
      routes: [{ pattern: `${stagingHost(app)}/*`, zone_name: 'tutur3u.com' }],
      assets: {
        binding: 'ASSETS',
        directory: './dist/client',
        run_worker_first: true,
        not_found_handling: 'none' as const,
        ...(app === 'calendar' ? { html_handling: 'none' as const } : {}),
      },
      vars: {
        NEXT_PUBLIC_APP_URL: origin,
        [`NEXT_PUBLIC_${app.toUpperCase()}_APP_URL`]: origin,
        NEXT_PUBLIC_WEB_APP_URL: stagingWebOrigin,
        INTERNAL_WEB_API_ORIGIN: stagingWebOrigin,
        AUTH_COOKIE_DOMAIN: stagingCookieDomain,
        NEXT_PUBLIC_TUTURUUU_STAGING: '1',
        WAVE1_STAGING_SUPABASE_PROJECT_REF: inputs.ref,
        TUTURUUU_NOINDEX: '1',
        ...(app === 'calendar'
          ? {
              GOOGLE_REDIRECT_URI: `${origin}/api/v1/calendar/auth/callback`,
              MICROSOFT_REDIRECT_URI: `${origin}/api/v1/calendar/auth/microsoft/callback`,
            }
          : {}),
        ...(app === 'mail'
          ? { MAIL_R2_BUCKET_NAME: 'tuturuuu-mail-hosted-staging' }
          : {}),
        ...(app === 'apps' ? { APPS_CANONICAL_HOST_ENABLED: '0' } : {}),
        ...(app === 'meet'
          ? {
              MEET_REALTIME_URL: `${origin.replace('https:', 'wss:')}/realtime`,
            }
          : {}),
      },
      ...(app === 'meet'
        ? {
            services: [
              {
                binding: 'WORKER_SELF_REFERENCE',
                service: 'tuturuuu-meet-hosted-staging',
              },
            ],
            r2_buckets: [
              {
                binding: 'NEXT_INC_CACHE_R2_BUCKET',
                bucket_name: 'tuturuuu-meet-hosted-staging-cache',
              },
            ],
            durable_objects: {
              bindings: [
                { name: 'MEET_LIVE', class_name: 'MeetLiveDurableObject' },
              ],
            },
            migrations: [
              {
                tag: 'meet-live-v1',
                new_sqlite_classes: ['MeetLiveDurableObject'],
              },
            ],
          }
        : {}),
      observability: { enabled: true, head_sampling_rate: 0.05 },
    },
  };
}

import { defineConfig } from 'void/config';

export function meetStagingConfig() {
  const subdomain = process.env.CLOUDFLARE_WORKERS_SUBDOMAIN;
  if (!subdomain || !/^[a-z0-9-]+$/.test(subdomain)) {
    throw new Error(
      'Owner must configure CLOUDFLARE_WORKERS_SUBDOMAIN for Meet staging'
    );
  }

  return defineConfig({
    target: 'cloudflare',
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
      name: 'tuturuuu-meet-wave1-staging',
      account_id: 'e8912e2867beecc673d171907bf09649',
      main: 'cloudflare/worker.ts',
      compatibility_date: '2026-09-06',
      compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
      workers_dev: false,
      preview_urls: false,
      routes: [],
      assets: {
        directory: './dist/client',
        binding: 'ASSETS',
        run_worker_first: true,
        not_found_handling: 'none',
      },
      services: [
        {
          binding: 'WORKER_SELF_REFERENCE',
          service: 'tuturuuu-meet-wave1-staging',
        },
      ],
      r2_buckets: [
        {
          binding: 'NEXT_INC_CACHE_R2_BUCKET',
          bucket_name: 'tuturuuu-meet-wave1-staging-cache',
        },
      ],
      durable_objects: {
        bindings: [{ name: 'MEET_LIVE', class_name: 'MeetLiveDurableObject' }],
      },
      migrations: [
        { tag: 'meet-live-v1', new_sqlite_classes: ['MeetLiveDurableObject'] },
      ],
      secrets: {
        required: [
          'MEET_REALTIME_TOKEN_SECRET',
          'NEXT_PUBLIC_SUPABASE_URL',
          'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
          'SUPABASE_SECRET_KEY',
          'GOOGLE_GENERATIVE_AI_API_KEY',
        ],
      },
      vars: {
        APP_ORIGIN: 'https://staging.tuturuuu.com',
        APP_BASE_PATH: '/meet',
        NEXT_PUBLIC_APP_URL: `https://tuturuuu-meet-wave1-staging.${subdomain}.workers.dev`,
        NEXT_PUBLIC_WEB_APP_URL: 'https://staging.tuturuuu.com',
        MEET_REALTIME_URL: `wss://tuturuuu-meet-realtime-wave1-staging.${subdomain}.workers.dev/realtime`,
        TUTURUUU_NOINDEX: '1',
      },
    },
  });
}

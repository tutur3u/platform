import { defineConfig } from 'void/config';
import hostedStaging from './void.hosted-staging.config';
import { meetStagingConfig } from './void.staging.config';

const production = defineConfig({
  target: 'cloudflare',
  inference: {
    bindings: { db: false, kv: false, storage: false, ai: false, email: false },
    scanDirs: [],
    build: 'vp build',
  },
  cloudflare: {
    name: 'tuturuuu-meet',
    account_id: 'e8912e2867beecc673d171907bf09649',
    main: 'cloudflare/worker.ts',
    compatibility_date: '2026-09-06',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    placement: {
      region: 'aws:ap-southeast-1',
    },
    assets: {
      directory: './dist/client',
      binding: 'ASSETS',
      run_worker_first: true,
      not_found_handling: 'none',
    },
    services: [
      {
        binding: 'WORKER_SELF_REFERENCE',
        service: 'tuturuuu-meet',
      },
      {
        // Meet AI usage limiter, reached over RPC with no public endpoint or
        // shared secret. Unbound or unreachable, the limiter fails closed.
        binding: 'ABUSE_GUARD',
        service: 'tuturuuu-abuse-guard',
        entrypoint: 'AbuseGuardEntrypoint',
      },
    ],
    r2_buckets: [
      {
        binding: 'NEXT_INC_CACHE_R2_BUCKET',
        bucket_name: 'tuturuuu-meet-cache',
      },
    ],
    images: {
      binding: 'IMAGES',
    },
    observability: {
      enabled: true,
      head_sampling_rate: 0.05,
    },
    workers_dev: true,
    routes: [
      {
        pattern: 'meet.tuturuuu.com',
        custom_domain: true,
      },
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
      NEXT_PUBLIC_APP_URL: 'https://meet.tuturuuu.com',
      NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
      MEET_REALTIME_URL: 'wss://meet-realtime.tuturuuu.com/realtime',
      PARLEY_APP_URL: 'https://parley.tuturuuu.com',
      // Meet AI containment (A1, 3 Nov 2026). It must match the live Worker vars,
      // because a deploy replaces vars and dropping these would turn Meet AI back on.
      // Lifting containment is a reviewed change to these two lines.
      MEET_AI_DISABLED: 'true',
      MEET_AI_ENABLED_WORKSPACE_IDS: '',
    },
    durable_objects: {
      bindings: [
        {
          name: 'MEET_LIVE',
          class_name: 'MeetLiveDurableObject',
        },
      ],
    },
    migrations: [
      {
        tag: 'meet-live-v1',
        new_sqlite_classes: ['MeetLiveDurableObject'],
      },
    ],
  },
});

export default process.env.WAVE1_HOSTED_STAGING === '1'
  ? hostedStaging()
  : process.env.MEET_DEPLOYMENT_PROFILE === 'staging'
    ? meetStagingConfig()
    : production;

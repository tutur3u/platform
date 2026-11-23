import { defineConfig } from 'void/config';
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
    workers_dev: false,
    preview_urls: false,
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
        'MEET_AI_DISABLED_WORKSPACE_IDS',
        'MEET_AI_PROTECTED_WORKSPACE_IDS',
        'TURNSTILE_SECRET_KEY',
      ],
    },
    vars: {
      NEXT_PUBLIC_APP_URL: 'https://meet.tuturuuu.com',
      NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
      MEET_REALTIME_URL: 'wss://meet-realtime.tuturuuu.com/realtime',
      PARLEY_APP_URL: 'https://parley.tuturuuu.com',
      // Public site key of the production guest-join Turnstile widget; its
      // root hostname covers both meet.tuturuuu.com and tuturuuu.com/meet.
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAAACFREAh7hBTozwxB',
      // Meet is mounted at tuturuuu.com/meet; server-built Meet links use it.
      NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS: 'meet',
      MEET_EDUCATION_ENABLED: 'true',
      // Strict classroom participant caps: 100 for staff hosts and Enterprise,
      // 50 for Plus/Pro, 10 for Free.
      MEET_CLASSROOM_LIMITS_ENABLED: 'true',
      // Meet AI is on for every workspace the gate admits: the kill switch
      // is off here, and the reviewed MEET_AI_ALL_WORKSPACES opt-in stays a
      // release-time secret, never source. A `contained` release overrides
      // MEET_AI_DISABLED back to true. The allowlist stays empty.
      // Attendance stays off unless the exact string true. Timer commands are rechecked.
      MEET_CLASS_ATTENDANCE_ENABLED: 'false',
      MEET_CLASS_TIMER_ENABLED: 'true',
      MEET_AI_DISABLED: 'false',
      MEET_AI_ENABLED_WORKSPACE_IDS: '',
      // The API proxy guard and the Meet AI usage limiter (transcript chunks
      // and notes) reach their stores over the ABUSE_GUARD binding. The
      // limiter fails closed unless `meet` is assigned here. `password` keeps
      // its own store path until it is moved deliberately.
      ABUSE_GUARD_FAMILIES: 'proxy,meet',
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

export default process.env.MEET_DEPLOYMENT_PROFILE === 'staging'
  ? meetStagingConfig()
  : production;

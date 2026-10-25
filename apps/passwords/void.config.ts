import { defineConfig } from 'void/config';

// Domain activation is a separate reviewed step: `routes` stays unset until the
// activation runbook (apps/docs/build/devops/passwords-start-void.mdx) is accepted.
export default defineConfig({
  target: 'cloudflare',
  remote: false,
  inference: {
    bindings: { db: false, kv: false, storage: false, ai: false, email: false },
    scanDirs: [],
    build: 'vp build',
  },
  cloudflare: {
    name: 'tuturuuu-passwords',
    main: './cloudflare/worker.ts',
    compatibility_date: '2026-10-12',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    assets: {
      binding: 'ASSETS',
      directory: './dist/client',
      not_found_handling: 'none',
      run_worker_first: true,
    },
    observability: {
      enabled: true,
      head_sampling_rate: 0.05,
      logs: { invocation_logs: false },
    },
    vars: {
      // Fail closed: every deploy without an explicit override disables vault work.
      PASSWORDS_ENABLED: 'false',
      NEXT_PUBLIC_APP_URL: 'https://passwords.tuturuuu.com',
      NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
    },
    secrets: {
      required: [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
        'SUPABASE_SECRET_KEY',
        'TUTURUUU_APP_COORDINATION_SECRET',
        'ENCRYPTION_MASTER_KEY',
      ],
    },
  },
});

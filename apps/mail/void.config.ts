import { defineConfig } from 'void/config';
import profiles from '../../scripts/ci/wave1-native-profiles.json' with { type: 'json' };
export default defineConfig({
  target: 'cloudflare',
  inference: {
    bindings: { db: false, kv: false, storage: false, ai: false, email: false },
    scanDirs: [],
    build: 'vp build',
  },
  cloudflare: {
    name: 'tuturuuu-mail',
    main: 'cloudflare/worker.ts',
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    assets: {
      directory: './dist/client',
      binding: 'ASSETS',
      run_worker_first: true,
      not_found_handling: 'none',
    },
    workers_dev: false,
    observability: profiles.apps.mail.observability,
    vars: {
      NEXT_PUBLIC_APP_URL: 'https://mail.tuturuuu.com',
      NEXT_PUBLIC_MAIL_APP_URL: 'https://mail.tuturuuu.com',
      NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
    },
  },
});

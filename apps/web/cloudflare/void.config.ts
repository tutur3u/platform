import { defineConfig } from 'void/config';
import { stagingProfile } from './profile.ts';

export default defineConfig({
  target: 'cloudflare',
  remote: false,
  inference: {
    bindings: { db: false, kv: false, storage: false, ai: false, email: false },
    scanDirs: [],
  },
  cloudflare: {
    name: 'tuturuuu-web-start-candidate',
    main: './worker.ts',
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    preview_urls: false,
    // No routes, custom domains, schedules or bindings are provisioned here.
    vars: {
      WEB_START_CANDIDATE: 'off',
      WEB_START_NATIVE_LEGAL: 'off',
      AUTH_COOKIE_DOMAIN: stagingProfile.cookieDomain,
      NEXT_PUBLIC_SUPABASE_URL: stagingProfile.supabaseUrl,
    },
    assets: {
      directory: './dist/client',
      binding: 'ASSETS',
      run_worker_first: true,
      not_found_handling: 'none',
      html_handling: 'none',
    },
  },
});

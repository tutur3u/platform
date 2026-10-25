import { defineConfig } from 'void/config';

// Staging profile for the native Tasks candidate. The source-declared sandbox
// name does not establish a hosted Worker, route or credential; production
// stays on Vercel until an explicit cutover PR. TUTURUUU_NATIVE_CANARY_PERCENT
// defaults to 0 (every browser legacy) per the start-bridge canary contract.
export default defineConfig({
  target: 'cloudflare',
  inference: {
    bindings: { db: false, kv: false, storage: false, ai: false, email: false },
    scanDirs: [],
    build: 'vp build --configLoader runner',
  },
  cloudflare: {
    name: 'tuturuuu-tasks-vite-staging',
    main: 'cloudflare/worker.ts',
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    assets: {
      directory: './dist/client',
      binding: 'ASSETS',
      run_worker_first: true,
      not_found_handling: 'none',
    },
    vars: {
      TUTURUUU_NOINDEX: '1',
      TUTURUUU_NATIVE_CANARY_PERCENT: '0',
    },
    workers_dev: false,
  },
});

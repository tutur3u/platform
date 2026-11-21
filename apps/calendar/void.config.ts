import { defineConfig } from 'void/config';

export default defineConfig({
  target: 'cloudflare',
  inference: {
    bindings: { db: false, kv: false, storage: false, ai: false, email: false },
    scanDirs: [],
    build: 'vp build',
  },
  cloudflare: {
    name: 'tuturuuu-calendar',
    main: 'cloudflare/worker.ts',
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    assets: {
      directory: './dist/client',
      binding: 'ASSETS',
      run_worker_first: true,
      not_found_handling: 'none',
      html_handling: 'none',
    },
    workers_dev: false,
    // Proxy abuse-guard state over RPC (SR-951). Without ABUSE_GUARD_KEY_PEPPER
    // the assigned proxy family reports `off` and the proxy fails open.
    services: [
      {
        binding: 'ABUSE_GUARD',
        service: 'tuturuuu-abuse-guard',
        entrypoint: 'AbuseGuardEntrypoint',
      },
    ],
    vars: { ABUSE_GUARD_FAMILIES: 'proxy' },
  },
});

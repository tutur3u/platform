import { defineConfig } from 'void/config';
export default defineConfig({
  target: 'cloudflare',
  remote: false,
  cloudflare: {
    name: 'tuturuuu-mastermind',
    main: './cloudflare/worker.ts',
    compatibility_date: '2026-10-12',
    // Calls to tuturuuu.com must reach the gateway Worker on that zone route.
    // Without this flag a same-zone fetch skips Workers and goes to the
    // retained origin, so every sign-in exchange and owner check fails.
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    preview_urls: false,
    assets: {
      binding: 'ASSETS',
      directory: './dist/client',
      not_found_handling: 'none',
      run_worker_first: true,
    },
    observability: { enabled: false },
  },
});

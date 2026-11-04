import { defineConfig } from 'void/config';
export default defineConfig({
  target: 'cloudflare',
  remote: false,
  cloudflare: {
    name: 'tuturuuu-mastermind',
    main: './cloudflare/worker.ts',
    compatibility_date: '2026-10-12',
    compatibility_flags: ['nodejs_compat'],
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

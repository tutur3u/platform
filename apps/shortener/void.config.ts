import { defineConfig } from 'void/config';

// Staging identity only. The canonical hosts stay fenced in the Worker until a
// reviewed cutover admits Shortener in the production publication policy.
export default defineConfig({
  target: 'cloudflare',
  remote: false,
  cloudflare: {
    name: 'tuturuuu-shortener-vite-staging',
    main: './cloudflare/worker.ts',
    compatibility_date: '2026-10-12',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: true,
    vars: { TUTURUUU_NOINDEX: '1' },
    assets: {
      binding: 'ASSETS',
      directory: './dist/client',
      not_found_handling: 'none',
      run_worker_first: true,
    },
    observability: { enabled: true, head_sampling_rate: 0.05 },
  },
});

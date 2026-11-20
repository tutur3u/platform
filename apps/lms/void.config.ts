import { defineConfig } from 'void/config';

export default defineConfig({
  target: 'cloudflare',
  remote: false,
  cloudflare: {
    name: 'tuturuuu-lms',
    main: './cloudflare/worker.ts',
    compatibility_date: '2026-10-12',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: false,
    preview_urls: false,
    vars: { TUTURUUU_NOINDEX: '1' },
    services: [
      { binding: 'TEACH', service: 'tuturuuu-teach' },
      { binding: 'LEARN', service: 'tuturuuu-learn' },
    ],
    assets: {
      binding: 'ASSETS',
      directory: './dist/client',
      not_found_handling: 'none',
      run_worker_first: true,
    },
    observability: { enabled: true, head_sampling_rate: 0.05 },
  },
});

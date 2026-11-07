import { defineConfig } from 'void/config';

export default defineConfig({
  target: 'cloudflare',
  inference: {
    bindings: { db: false, kv: false, storage: false, ai: false, email: false },
    scanDirs: [],
    build: 'vp build',
  },
  cloudflare: {
    name: 'tuturuuu-roadmap',
    compatibility_date: '2026-11-07',
    compatibility_flags: ['nodejs_compat'],
    routes: [
      { pattern: 'tuturuuu.com/roadmap', zone_name: 'tuturuuu.com' },
      { pattern: 'tuturuuu.com/roadmap/*', zone_name: 'tuturuuu.com' },
    ],
    workers_dev: true,
    assets: {
      directory: './dist/client',
      binding: 'ASSETS',
      base_path: '/roadmap',
      run_worker_first: true,
      not_found_handling: 'none',
    },
  },
});

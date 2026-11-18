import { defineConfig } from 'void/config';

export default defineConfig({
  target: 'cloudflare',
  inference: {
    bindings: { db: false, kv: false, storage: false, ai: false, email: false },
    scanDirs: [],
    build: 'vp build && node scripts/package-assets.mjs',
  },
  cloudflare: {
    name: 'tuturuuu-roadmap',
    main: './src/worker.ts',
    // At or below the locked dev workerd's date (vp dev refuses a later one;
    // scripts/dev-runtime.test.mjs). No runtime flag defaults on between
    // 2026-10-12 and 2026-11-17.
    compatibility_date: '2026-10-12',
    compatibility_flags: ['nodejs_compat'],
    routes: [
      { pattern: 'tuturuuu.com/roadmap', zone_name: 'tuturuuu.com' },
      { pattern: 'tuturuuu.com/roadmap/*', zone_name: 'tuturuuu.com' },
    ],
    workers_dev: true,
    vars: { ROADMAP_REFRESH_ENABLED: 'true' },
    triggers: { crons: ['17 * * * *'] },
    durable_objects: {
      bindings: [{ name: 'ROADMAP_ACTIVITY', class_name: 'RoadmapActivity' }],
    },
    migrations: [
      { tag: 'roadmap-activity-v1', new_sqlite_classes: ['RoadmapActivity'] },
    ],
    assets: {
      directory: './dist/client',
      binding: 'ASSETS',
      run_worker_first: true,
      not_found_handling: 'none',
    },
  },
});

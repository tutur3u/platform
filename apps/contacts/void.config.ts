import { defineConfig } from 'void/config';
import productionVars from './cloudflare/production-profile.json';

// Staging candidate only: production stays held in tuturuuu.ci.ts until an
// explicitly reviewed cutover PR admits this app.
export default defineConfig({
  target: 'cloudflare',
  remote: false,
  cloudflare: {
    name: 'tuturuuu-contacts',
    main: './cloudflare/worker.ts',
    compatibility_date: '2026-10-12',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    preview_urls: false,
    upload_source_maps: false,
    vars: productionVars,
    assets: {
      binding: 'ASSETS',
      directory: './dist/client',
      not_found_handling: 'none',
      run_worker_first: true,
    },
    observability: { enabled: true, head_sampling_rate: 0.05 },
  },
});

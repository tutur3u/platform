// Staging-only Worker profile; the current Next app remains the production owner.
import { defineConfig } from 'void/config';
import { stagingVars } from './src/start-candidate/staging-policy';

// No routes or custom domains: hostname attachment requires separate approval.
export default defineConfig({
  target: 'cloudflare',
  remote: false,
  cloudflare: {
    name: 'tuturuuu-drive-vite-staging',
    main: './cloudflare/worker.ts',
    compatibility_date: '2026-10-12',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    vars: stagingVars,
    assets: {
      binding: 'ASSETS',
      directory: './dist/client',
      not_found_handling: 'none',
      run_worker_first: true,
    },
    observability: { enabled: true, head_sampling_rate: 0.05 },
  },
});

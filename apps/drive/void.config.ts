// Separate staging and production Worker profiles; Rex owns cutover.
import { defineConfig } from 'void/config';
import productionVars from './cloudflare/production-profile.json';
import { stagingVars } from './src/start-candidate/staging-policy';

const production = process.env.VITE_DRIVE_NATIVE_PROFILE === 'production';
// Rex attaches the production domain after deploying the emitted artifact.
export default defineConfig({
  target: 'cloudflare',
  remote: false,
  cloudflare: {
    name: production ? 'tuturuuu-drive' : 'tuturuuu-drive-vite-staging',
    main: './cloudflare/worker.ts',
    compatibility_date: '2026-10-12',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    vars: production ? productionVars : stagingVars,
    assets: {
      binding: 'ASSETS',
      directory: './dist/client',
      not_found_handling: 'none',
      run_worker_first: true,
    },
    observability: { enabled: true, head_sampling_rate: 0.05 },
  },
});

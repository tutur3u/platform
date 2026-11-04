import { defineConfig } from 'void/config';

// Route-free profiles; Rex attaches the hostname after private smoke.
const profile = process.env.VITE_CMS_NATIVE_PROFILE || 'staging';
if (profile !== 'staging' && profile !== 'production') {
  throw new Error(`Unknown VITE_CMS_NATIVE_PROFILE: ${profile}`);
}
export default defineConfig({
  target: 'cloudflare',
  remote: false,
  cloudflare: {
    name:
      profile === 'production' ? 'tuturuuu-cms' : 'tuturuuu-cms-vite-staging',
    main: './cloudflare/worker.ts',
    compatibility_date: '2026-10-12',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
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

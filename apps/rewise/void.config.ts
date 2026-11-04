import { defineConfig } from 'void/config';
import { NATIVE_PROFILE_ENV, resolveNativeProfile } from './native-profile';

// Route-free profiles: the hostname is attached at cutover.
const profile = resolveNativeProfile(process.env[NATIVE_PROFILE_ENV]);

export default defineConfig({
  target: 'cloudflare',
  remote: false,
  cloudflare: {
    name: profile.workerName,
    main: './cloudflare/worker.ts',
    compatibility_date: '2026-10-12',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    preview_urls: false,
    vars: { TUTURUUU_NOINDEX: profile.noindex },
    assets: {
      binding: 'ASSETS',
      directory: './dist/client',
      not_found_handling: 'none',
      run_worker_first: true,
    },
    observability: { enabled: true, head_sampling_rate: 0.05 },
  },
});

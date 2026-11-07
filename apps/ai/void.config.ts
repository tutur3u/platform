import { defineConfig } from 'void/config';
import {
  AI_NATIVE_PROFILE_ENV,
  resolveAiNativeProfile,
} from './native-profile';

// Route-free profiles: Rex attaches the hostname after private smoke.
const profile = resolveAiNativeProfile(process.env[AI_NATIVE_PROFILE_ENV]);
export default defineConfig({
  target: 'cloudflare',
  remote: false,
  cloudflare: {
    name: profile.workerName,
    main: './cloudflare/worker.ts',
    compatibility_date: '2026-10-12',
    compatibility_flags: [
      'nodejs_compat',
      'global_fetch_strictly_public',
      'enable_request_signal',
    ],
    workers_dev: false,
    preview_urls: false,
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

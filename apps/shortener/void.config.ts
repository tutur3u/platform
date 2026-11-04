import { defineConfig } from 'void/config';
import {
  resolveShortenerNativeProfile,
  SHORTENER_NATIVE_PROFILE_ENV,
} from './cloudflare/native-profile.ts';

// Staging by default. Routes attach at cutover, never from config.
const profile = resolveShortenerNativeProfile(
  process.env[SHORTENER_NATIVE_PROFILE_ENV]
);

export default defineConfig({
  target: 'cloudflare',
  remote: false,
  cloudflare: {
    name: profile.workerName,
    main: './cloudflare/worker.ts',
    compatibility_date: '2026-10-12',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: profile.workersDev,
    ...(profile.workersDev ? {} : { preview_urls: false }),
    vars: profile.vars,
    assets: {
      binding: 'ASSETS',
      directory: './dist/client',
      not_found_handling: 'none',
      run_worker_first: true,
    },
    observability: { enabled: true, head_sampling_rate: 0.05 },
  },
});

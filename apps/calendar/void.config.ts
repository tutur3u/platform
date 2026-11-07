import { defineConfig } from 'void/config';
import hostedStaging from './void.hosted-staging.config';

const standard = defineConfig({
  target: 'cloudflare',
  inference: {
    bindings: { db: false, kv: false, storage: false, ai: false, email: false },
    scanDirs: [],
    build: 'vp build',
  },
  cloudflare: {
    name: 'tuturuuu-calendar',
    main: 'cloudflare/worker.ts',
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    assets: {
      directory: './dist/client',
      binding: 'ASSETS',
      run_worker_first: true,
      not_found_handling: 'none',
      html_handling: 'none',
    },
    workers_dev: false,
  },
});

export default process.env.WAVE1_HOSTED_STAGING === '1'
  ? hostedStaging()
  : standard;

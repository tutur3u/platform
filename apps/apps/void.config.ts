import { defineConfig } from 'void/config';
import hostedStaging from './void.hosted-staging.config';

const standard = defineConfig({
  target: 'cloudflare',
  remote: false,
  cloudflare: {
    name: 'tuturuuu-apps-vite-staging',
    main: './cloudflare/worker.ts',
    compatibility_date: '2026-10-12',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: true,
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

export default process.env.WAVE1_HOSTED_STAGING === '1'
  ? hostedStaging()
  : standard;

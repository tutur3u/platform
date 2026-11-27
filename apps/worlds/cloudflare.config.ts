import { defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'tuturuuu-worlds',
    entrypoint: 'src/worker.ts',
    compatibilityDate: '2026-11-27',
    compatibilityFlags: ['nodejs_compat'],
    workersDev: false,
    previewUrls: false,
  },
});

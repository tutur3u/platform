import { defineConfig } from 'cf/config';
import config from '../../../cloudflare.config.ts';

export default defineConfig({
  ...config,
  worker: { ...config.worker, entrypoint: 'worker.ts' },
});

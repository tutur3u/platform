import { execFileSync } from 'node:child_process';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  define: {
    __API_BUILD_SHA__: JSON.stringify(
      execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    ),
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'worker' },
      remoteBindings: false,
      inspectorPort: false,
      experimental: { newConfig: { cfBuildOutput: true } },
    }),
  ],
  environments: {
    worker: { build: { outDir: 'dist/worker', sourcemap: false } },
  },
});

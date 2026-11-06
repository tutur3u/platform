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
      configPath: './wrangler.jsonc',
      viteEnvironment: { name: 'worker' },
      remoteBindings: false,
      inspectorPort: false,
    }),
  ],
  environments: { worker: { build: { outDir: 'dist/worker' } } },
});

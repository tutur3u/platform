import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const webRequire = createRequire(
  new URL('../../../apps/web/package.json', import.meta.url)
);
const sdkRoot =
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: This standalone Node test config is not run or cached through Turbo.
  process.env.TUTURUUU_MCP_SDK_DIR ??
  resolve(
    dirname(webRequire.resolve('@modelcontextprotocol/sdk/server/mcp.js')),
    '../../..'
  );
export default defineConfig({
  root,
  cacheDir: `${root}/tmp/mcp-vitest-cache`,
  tsconfig: `${root}/plugins/tuturuuu/hosted/tsconfig.test.json`,
  test: {
    include: [
      'apps/web/src/lib/mcp/*.test.ts',
      'plugins/tuturuuu/hosted/*.test.ts',
    ],
    environment: 'node',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 10000,
  },
  resolve: {
    alias: [
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/,
        replacement: `${root}/packages/internal-api/src/$1.ts`,
      },
      {
        find: /^@modelcontextprotocol\/sdk\/(.+)$/,
        replacement: `${sdkRoot}/dist/esm/$1`,
      },
    ],
  },
});

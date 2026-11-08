import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const tsc = join(root, 'node_modules/.bin/tsc');

// Retained Next apps (e.g. a proxy using appPath) compile app-url under the
// shared Next tsconfig, which has no vite/client types: it must type-check
// there without making Vite types global to Next apps.
it('type-checks under the Next tsconfig without Vite types', () => {
  const dir = mkdtempSync(join(tmpdir(), 'start-bridge-next-types-'));
  try {
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        extends: join(root, 'packages/typescript-config/nextjs.json'),
        compilerOptions: {
          noEmit: true,
          incremental: false,
          plugins: [],
          // The Next config's `types: ["node"]`, resolved from the repo.
          typeRoots: [join(root, 'node_modules/@types')],
        },
        files: [
          join(root, 'packages/start-bridge/src/core/app-url.ts'),
          join(root, 'packages/start-bridge/src/core/base-path.ts'),
        ],
      })
    );
    const result = spawnSync(tsc, ['-p', join(dir, 'tsconfig.json')], {
      encoding: 'utf8',
      timeout: 120000,
    });
    // Only diagnostics matter (a resource shim may print a notice).
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/error TS/u);
    expect(result.status).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 150000);

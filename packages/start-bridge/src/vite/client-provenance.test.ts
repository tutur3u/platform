import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import { clientProvenancePlugin } from './client-provenance';

async function fixture(source: string, check?: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'bridge-provenance-'));
  try {
    mkdirSync(join(root, 'start-bridge/src/server'), { recursive: true });
    writeFileSync(
      join(root, 'start-bridge/src/server/request-store.js'),
      'export const store = 42;'
    );
    writeFileSync(join(root, 'entry.js'), source);
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [clientProvenancePlugin()],
      build: {
        minify: false,
        lib: {
          entry: join(root, 'entry.js'),
          formats: ['es'],
          fileName: 'entry',
        },
      },
    });
    check?.(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('emitted client provenance', () => {
  it('binds module graph evidence to actual emitted bytes', async () => {
    await fixture('export const value = 42;', (root) => {
      const receipt = JSON.parse(
        readFileSync(join(root, 'dist/client-provenance.json'), 'utf8')
      );
      expect(
        receipt.modules.some((module: { id: string }) =>
          module.id.endsWith('/entry.js')
        )
      ).toBe(true);
      for (const chunk of receipt.chunks) {
        const bytes = readFileSync(join(root, 'dist', chunk.fileName));
        expect(chunk.sha256).toBe(
          createHash('sha256').update(bytes).digest('hex')
        );
      }
      expect(receipt.computedImports).toBe('reject-unresolved');
    });
  });
  it.each([
    "export { store } from './start-bridge/src/server/request-store.js';",
    "export const load = () => import('./start-bridge/src/server/request-store.js');",
  ])(
    'rejects server-store provenance even after bundling: %s',
    async (source) => {
      await expect(fixture(source)).rejects.toThrow(
        'Server request store in client graph'
      );
    }
  );
  it('rejects unresolved computed imports instead of claiming computed proof', async () => {
    await expect(
      fixture('export const load = (name) => import(/* @vite-ignore */ name);')
    ).rejects.toThrow('unresolved computed import');
  });
  it('rejects browser-externalized async_hooks', async () => {
    await expect(
      fixture(
        "import hooks from 'node:async_hooks'; export const value = hooks;"
      )
    ).rejects.toThrow('Server request store in client graph');
  });
});

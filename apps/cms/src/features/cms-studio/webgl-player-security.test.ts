import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../..'
);

const playerFiles = [
  'apps/cms/src/app/[locale]/(dashboard)/[wsId]/library/entries/[entryId]/webgl/[assetId]/page.tsx',
  'apps/cms/src/app/[locale]/play/[wsId]/webgl/[assetId]/page.tsx',
];

describe('CMS WebGL player sandboxing', () => {
  it('keeps uploaded WebGL documents out of the CMS origin', () => {
    for (const file of playerFiles) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8');

      expect(source).toContain(
        'sandbox="allow-downloads allow-modals allow-pointer-lock allow-scripts"'
      );
      expect(source).not.toContain('allow-same-origin');
    }
  });
});

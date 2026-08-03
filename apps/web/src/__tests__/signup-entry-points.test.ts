import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);

const userFacingEntryPoints = [
  'apps/web/src/app/[locale]/public-navbar-actions.tsx',
  'apps/web/src/components/landing/cta/cta-section.tsx',
  'apps/web/src/components/landing/hero/hero-section.tsx',
  'packages/satellite/src/components/create-navbar-actions.tsx',
  'packages/satellite/src/components/navbar-actions.tsx',
  'apps/tanstack-web/src/components/landing/landing-conversion-sections.tsx',
  'apps/tanstack-web/src/components/landing/landing-hero.tsx',
  'apps/tanstack-web/src/components/route-shell.tsx',
  'apps/tanstack-web/src/routes/$locale/products/ai.tsx',
  'apps/tanstack-web/src/routes/$locale/products/documents.tsx',
  'apps/tanstack-web/src/routes/$locale/products/workflows.tsx',
] as const;

describe('signup entry points', () => {
  it('do not target the retired signup route', () => {
    for (const relativePath of userFacingEntryPoints) {
      const source = readFileSync(resolve(repoRoot, relativePath), 'utf8');

      expect(source, relativePath).not.toMatch(/['"`]\/signup['"`]/u);
    }
  });
});

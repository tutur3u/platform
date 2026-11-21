import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  devWorkspaceSourcePlugin,
  resolveWorkspaceInternalImport,
  resolveWorkspaceSource,
} from './dev-workspace-source';

const packagesRoot = fileURLToPath(
  new URL('../../../../packages', import.meta.url)
);

describe('dev workspace source resolution', () => {
  it('maps internal-api subpaths and the package root to TypeScript source', () => {
    expect(
      resolveWorkspaceSource(
        packagesRoot,
        '@tuturuuu/internal-api/task-recurrence'
      )
    ).toMatch(/packages\/internal-api\/src\/task-recurrence\.ts$/u);
    expect(
      resolveWorkspaceSource(packagesRoot, '@tuturuuu/internal-api')
    ).toMatch(/packages\/internal-api\/src\/index\.ts$/u);
  });

  it('expands wildcard exports such as types primitives', () => {
    expect(
      resolveWorkspaceSource(packagesRoot, '@tuturuuu/types/primitives/Task')
    ).toMatch(/packages\/types\/src\/primitives\/Task\.ts$/u);
  });

  it('maps ESM dist-only packages so a fresh checkout needs no build', () => {
    expect(
      resolveWorkspaceSource(packagesRoot, '@tuturuuu/supabase/next/server')
    ).toMatch(/packages\/supabase\/src\/next\/server\.tsx?$/u);
    expect(
      resolveWorkspaceSource(
        packagesRoot,
        '@tuturuuu/supabase/shared-cookie-domains'
      )
    ).toMatch(/packages\/supabase\/src\/shared-cookie-domains\.ts$/u);
  });

  it('maps package-internal imports per environment', () => {
    const importer = `${packagesRoot}/supabase/src/next/server.ts`;
    expect(
      resolveWorkspaceInternalImport(
        packagesRoot,
        '#secret-env',
        importer,
        false
      )
    ).toMatch(/packages\/supabase\/src\/next\/secret-env\.ts$/u);
    expect(
      resolveWorkspaceInternalImport(
        packagesRoot,
        '#secret-env',
        importer,
        true
      )
    ).toMatch(/packages\/supabase\/src\/next\/secret-env\.browser\.ts$/u);
    expect(
      resolveWorkspaceInternalImport(
        packagesRoot,
        '#secret-env',
        `${packagesRoot}/ui/src/index.ts`,
        false
      )
    ).toBeNull();
  });

  it('selects the client or server target for conditional exports', () => {
    expect(
      resolveWorkspaceSource(
        packagesRoot,
        '@tuturuuu/supabase/next/secret-env',
        true
      )
    ).toMatch(/packages\/supabase\/src\/next\/secret-env\.browser\.ts$/u);
    expect(
      resolveWorkspaceSource(
        packagesRoot,
        '@tuturuuu/supabase/next/secret-env',
        false
      )
    ).toMatch(/packages\/supabase\/src\/next\/secret-env\.ts$/u);
  });

  it('rejects wildcard captures that leave the package', () => {
    expect(
      resolveWorkspaceSource(
        packagesRoot,
        '@tuturuuu/types/primitives/../../../supabase/src/next/secret-env'
      )
    ).toBeNull();
  });

  it('leaves client-denied specifiers to import protection', () => {
    const plugin = devWorkspaceSourcePlugin(packagesRoot, {
      clientDenied: ['@tuturuuu/supabase/next/server'],
    });
    const resolve = (name: string) =>
      plugin.resolveId.call(
        { environment: { name } },
        '@tuturuuu/supabase/next/server'
      );
    expect(resolve('client')).toBeUndefined();
    expect(resolve('ssr')).toMatch(
      /packages\/supabase\/src\/next\/server\.ts$/u
    );
  });

  it('leaves other specifiers to the normal resolver', () => {
    expect(
      resolveWorkspaceSource(packagesRoot, '@tuturuuu/ui/button')
    ).toBeNull();
    expect(resolveWorkspaceSource(packagesRoot, 'react')).toBeNull();
    expect(
      resolveWorkspaceSource(
        packagesRoot,
        '@tuturuuu/internal-api/not-exported'
      )
    ).toBeNull();
  });

  it('applies only to the dev server, never to builds', () => {
    expect(devWorkspaceSourcePlugin(packagesRoot).apply).toBe('serve');
  });
});

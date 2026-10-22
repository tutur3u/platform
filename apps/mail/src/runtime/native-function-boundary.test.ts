import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveMailActionPort } from './action-port-plugin';

const appRoot = resolve(__dirname, '../..');
const moduleSpecifier =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+|\b(?:vi|jest)\.mock\s*\(\s*)(['"])([^'"\n]+)\1/gu;
function foreignEdges(source: string, importer: string) {
  return Array.from(source.matchAll(moduleSpecifier), (match) => match[2])
    .filter((specifier): specifier is string => !!specifier?.startsWith('.'))
    .filter((specifier) => {
      const target = resolve(importer, '..', specifier);
      return relative(appRoot, target).startsWith('..');
    });
}
function implementationFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (
      ['node_modules', 'dist', '.turbo', '.typecheck', '.git'].includes(
        entry.name
      )
    )
      return [];
    const filename = resolve(dir, entry.name);
    if (entry.isDirectory()) return implementationFiles(filename);
    return ['.ts', '.tsx', '.js', '.mjs', '.cjs'].includes(extname(filename))
      ? [filename]
      : [];
  });
}

describe('shared action port resolution', () => {
  it('redirects the actual relative realtime import without recursively replacing its server supplier', () => {
    const provider = resolve(
      __dirname,
      '../../../../packages/supabase/src/next/realtime-log-provider.tsx'
    );
    const port = resolveMailActionPort('./realtime-log-actions', provider);
    expect(port).toBe(resolve(__dirname, 'realtime-actions.ts'));
    expect(
      resolveMailActionPort(
        '../../../../packages/supabase/src/next/realtime-log-actions',
        resolve(__dirname, 'realtime-actions.server.ts')
      )
    ).toBeUndefined();
  });
  it('ports public client imports while preserving actual server suppliers', () => {
    const callers = [
      ['@tuturuuu/satellite/workspace-actions', 'workspace-actions'],
      ['@tuturuuu/supabase/next/realtime-log-actions', 'realtime-actions'],
    ];
    for (const [specifier, name] of callers) {
      if (!specifier || !name) throw new Error('Missing port fixture');
      expect(
        resolveMailActionPort(specifier, resolve(__dirname, 'client.tsx'))
      ).toBe(resolve(__dirname, `${name}.ts`));
      expect(
        resolveMailActionPort(
          specifier,
          resolve(__dirname, `${name}.server.ts?start`)
        )
      ).toBeUndefined();
      expect(
        resolveMailActionPort(
          `${specifier}/unexpected`,
          resolve(__dirname, 'client.tsx')
        )
      ).toBeUndefined();
    }
    expect(
      resolveMailActionPort(
        '@tuturuuu/satellite/workspace-invitation',
        resolve(__dirname, 'client.tsx')
      )
    ).toBeUndefined();
    const vite = readFileSync(resolve(appRoot, 'vite.config.ts'), 'utf8');
    expect(vite).not.toContain(
      'find: /^@tuturuuu\\/satellite\\/workspace-actions$/u'
    );
  });

  it('keeps every Mail production/test module edge inside Mail or a package export', () => {
    const files = implementationFiles(appRoot);
    expect(files.length).toBeGreaterThan(10);
    const edges = files.flatMap((filename) =>
      foreignEdges(readFileSync(filename, 'utf8'), filename).map(
        (specifier) => ({ filename, specifier })
      )
    );
    expect(edges).toEqual([]);
    const raw = '../../../../packages/supabase/src/next/realtime-log-actions';
    const importer = resolve(__dirname, 'realtime-actions.server.ts');
    for (const form of [
      ['import(', JSON.stringify(raw), ')'],
      ['export { addRealtimeLog } from ', JSON.stringify(raw), ';'],
      ['vi.mock(', JSON.stringify(raw), ', () => ({}))'],
    ])
      expect(foreignEdges(form.join(''), importer)).toEqual([raw]);
    expect(
      foreignEdges(
        "import('@tuturuuu/supabase/next/realtime-log-actions')",
        importer
      )
    ).toEqual([]);
  });

  it('uses narrow existing package owners and real Supabase build output locations', () => {
    const read = (path: string) =>
      JSON.parse(readFileSync(resolve(appRoot, path), 'utf8'));
    const supabase = read('../../packages/supabase/package.json');
    const build = read('../../packages/supabase/tsconfig.json');
    const satellite = read('../../packages/satellite/package.json');
    expect(supabase.exports['./next/realtime-log-actions']).toEqual({
      types: './dist/next/realtime-log-actions.d.ts',
      bun: './src/next/realtime-log-actions.ts',
      default: './dist/next/realtime-log-actions.js',
    });
    expect(supabase.scripts.build).toBe('tsc --build');
    expect(build.include).toEqual(['src']);
    expect(build.compilerOptions).toMatchObject({
      rootDir: 'src',
      outDir: 'dist',
      declarationDir: 'dist',
      emitDeclarationOnly: false,
    });
    expect(
      existsSync(
        resolve(
          appRoot,
          '../../packages/supabase/src/next/realtime-log-actions.ts'
        )
      )
    ).toBe(true);
    expect(satellite.exports['./workspace-actions']).toBe(
      './src/utils/workspace-actions.ts'
    );
    expect(satellite.exports['./workspace-invitation']).toBe(
      './src/components/workspace-invitation/index.ts'
    );
    const invitation = readFileSync(
      resolve(
        appRoot,
        '../../packages/satellite/src/components/workspace-invitation/index.ts'
      ),
      'utf8'
    );
    expect(invitation).toContain('SatelliteWorkspaceInvitationCard');
    expect(
      readFileSync(resolve(__dirname, 'workspace-invitation-client.ts'), 'utf8')
    ).toContain("from '@tuturuuu/satellite/workspace-invitation'");
  });

  it('keeps CSRF and fail-closed client import protection enabled', () => {
    const start = readFileSync(resolve(__dirname, '../start.ts'), 'utf8');
    const vite = readFileSync(
      resolve(__dirname, '../../vite.config.ts'),
      'utf8'
    );
    expect(start).toContain('createCsrfMiddleware');
    expect(vite).toContain("behavior: 'error'");
    expect(vite).toContain('rsc: { enabled: false }');
  });
});

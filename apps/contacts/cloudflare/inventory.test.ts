// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import manifest from '../start-route-manifest.json';
import { generateInventory, routeManifest, routePattern } from './inventory';
import { createSourceGraph } from './inventory-source';

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'contacts-inventory-'));
  temporary.push(root);
  const write = (name: string, source: string) => {
    const path = resolve(root, name);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, source);
  };
  return { root, write };
}

describe('Contacts route census', () => {
  it('keeps source churn in the artifact and orders modules by codepoint', () => {
    const { root, write } = fixture();
    write('apps/contacts/vercel.json', '{"crons":[]}');
    write('packages/fixture/package.json', '{"exports":{}}');
    write(
      'apps/contacts/src/app/page.tsx',
      "import './a'; import './Z'; export default () => null;"
    );
    write('apps/contacts/src/app/a.ts', 'export const a = 1;');
    write('apps/contacts/src/app/Z.ts', 'export const z = 1;');
    const before = generateInventory(root);
    write('apps/contacts/src/app/a.ts', "'use server'; export const a = 2;");
    const after = generateInventory(root);
    expect(Object.keys(after.modules)).toEqual(
      Object.keys(after.modules).sort()
    );
    expect(
      Object.keys(after.modules).indexOf('apps/contacts/src/app/Z.ts')
    ).toBeLessThan(
      Object.keys(after.modules).indexOf('apps/contacts/src/app/a.ts')
    );
    expect(before.modules).not.toEqual(after.modules);
    expect(before.routes).not.toEqual(after.routes);
    expect(routeManifest(before)).toEqual(routeManifest(after));
    expect(routeManifest(after)).not.toHaveProperty('modules');
    expect(routeManifest(after).routes[0]).not.toHaveProperty('boundaries');
    expect(routeManifest(after).routes[0]).not.toHaveProperty('roots');
    write('apps/contacts/src/app/new/page.tsx', 'export default () => null;');
    expect(routeManifest(generateInventory(root))).not.toEqual(
      routeManifest(after)
    );
  });
  it('traces actions and aliased framework calls through cycles, reexports and workspace source exports', () => {
    const { root, write } = fixture();
    write(
      'apps/contacts/src/page.tsx',
      `import './cycle'; import '@/actions'; export { value } from '@tuturuuu/fixture/server'; // after(() => {})`
    );
    write(
      'apps/contacts/src/cycle.ts',
      `import './page'; import * as next from 'next/server'; next.after(() => {});`
    );
    write(
      'apps/contacts/src/actions.ts',
      `'use server'; import { connection as requestTime } from 'next/server'; requestTime();`
    );
    write(
      'packages/fixture/package.json',
      JSON.stringify({
        exports: { './*': { bun: './src/*.ts', default: './dist/*.js' } },
      })
    );
    write(
      'packages/fixture/src/server.ts',
      `export const value = async () => { 'use cache: private'; };`
    );
    const graph = createSourceGraph(`${root}/`);
    const boundaries = graph.boundaries(['apps/contacts/src/page.tsx']);
    expect(boundaries).toEqual({
      serverActions: ['apps/contacts/src/actions.ts'],
      after: ['apps/contacts/src/cycle.ts'],
      connection: ['apps/contacts/src/actions.ts'],
      useCache: ['packages/fixture/src/server.ts'],
    });
    expect(
      graph.modules.get('apps/contacts/src/actions.ts')?.sha256
    ).toHaveLength(64);
  });
  it('does not mistake comments, strings or unrelated functions for framework work', () => {
    const { root, write } = fixture();
    write(
      'apps/contacts/src/page.tsx',
      `// 'use server'; after(() => {});\nconst after = () => {}; after(); const text = "connection()";`
    );
    expect(
      createSourceGraph(root).boundaries(['apps/contacts/src/page.tsx'])
    ).toEqual({ serverActions: [], after: [], connection: [], useCache: [] });
  });
  it('retains unresolved first-party edges as migration blockers', () => {
    const { root, write } = fixture();
    write(
      'apps/contacts/src/page.ts',
      `import '@/missing'; import '@tuturuuu/missing'; import './image.png';`
    );
    const graph = createSourceGraph(`${root}/`);
    graph.boundaries(['apps/contacts/src/page.ts']);
    expect(graph.modules.get('apps/contacts/src/page.ts')?.unresolved).toEqual([
      '@/missing',
      '@tuturuuu/missing',
    ]);
  });
  it('normalizes groups while retaining dynamic and catch-all route parameters', () => {
    expect(
      routePattern('[locale]/(dashboard)/[wsId]/api/[...path]/route.ts')
    ).toBe('/[locale]/[wsId]/api/[...path]');
    expect(routePattern('(marketing)/page.tsx')).toBe('/');
  });
  it('keeps all customer routes and APIs on Next with one inert probe', () => {
    expect(
      manifest.routes
        .filter((route) => route.disposition === 'native-Start')
        .map((route) => route.pattern)
    ).toEqual(['/__contacts1']);
    expect(manifest.crons).toEqual([]);
    expect(
      manifest.routes.find((route) => route.category === 'api-proxy')
    ).toMatchObject({ owner: 'web-next', disposition: 'Next-fallback' });
    for (const route of manifest.routes.filter(
      (route) => route.category === 'api' || route.category === 'page'
    )) {
      expect(route.owner).toBe('contacts-next');
      expect(route.disposition).toBe('Next-fallback');
    }
    expect(
      manifest.routes.some((route) => route.pattern.includes('tutoring'))
    ).toBe(true);
  });
});

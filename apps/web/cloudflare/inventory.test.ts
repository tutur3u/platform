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
  const root = mkdtempSync(resolve(tmpdir(), 'web-inventory-'));
  temporary.push(root);
  const write = (name: string, source: string) => {
    const path = resolve(root, name);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, source);
  };
  return { root, write };
}

describe('Web route census', () => {
  it('keeps source churn in the artifact and orders modules by codepoint', () => {
    const { root, write } = fixture();
    write('apps/web/vercel.json', '{"crons":[]}');
    write('packages/fixture/package.json', '{"exports":{}}');
    write(
      'apps/web/src/app/page.tsx',
      "import './a'; import './Z'; export default () => null;"
    );
    write('apps/web/src/app/a.ts', 'export const a = 1;');
    write('apps/web/src/app/Z.ts', 'export const z = 1;');
    const before = generateInventory(root);
    write('apps/web/src/app/a.ts', "'use server'; export const a = 2;");
    const after = generateInventory(root);
    expect(Object.keys(after.modules)).toEqual(
      Object.keys(after.modules).sort()
    );
    expect(
      Object.keys(after.modules).indexOf('apps/web/src/app/Z.ts')
    ).toBeLessThan(Object.keys(after.modules).indexOf('apps/web/src/app/a.ts'));
    expect(before.modules).not.toEqual(after.modules);
    expect(before.routes).not.toEqual(after.routes);
    expect(routeManifest(before)).toEqual(routeManifest(after));
    expect(routeManifest(after)).not.toHaveProperty('modules');
    expect(routeManifest(after).routes[0]).not.toHaveProperty('boundaries');
    expect(routeManifest(after).routes[0]).not.toHaveProperty('roots');
    write('apps/web/src/app/new/page.tsx', 'export default () => null;');
    expect(routeManifest(generateInventory(root))).not.toEqual(
      routeManifest(after)
    );
  });
  it('traces actions and aliased framework calls through cycles, reexports and workspace source exports', () => {
    const { root, write } = fixture();
    write(
      'apps/web/src/page.tsx',
      `import './cycle'; import '@/actions'; export { value } from '@tuturuuu/fixture/server'; // after(() => {})`
    );
    write(
      'apps/web/src/cycle.ts',
      `import './page'; import * as next from 'next/server'; next.after(() => {});`
    );
    write(
      'apps/web/src/actions.ts',
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
    const boundaries = graph.boundaries(['apps/web/src/page.tsx']);
    expect(boundaries).toEqual({
      serverActions: ['apps/web/src/actions.ts'],
      after: ['apps/web/src/cycle.ts'],
      connection: ['apps/web/src/actions.ts'],
      useCache: ['packages/fixture/src/server.ts'],
    });
    expect(graph.modules.get('apps/web/src/actions.ts')?.sha256).toHaveLength(
      64
    );
  });
  it('does not mistake comments, strings or unrelated functions for framework work', () => {
    const { root, write } = fixture();
    write(
      'apps/web/src/page.tsx',
      `// 'use server'; after(() => {});\nconst after = () => {}; after(); const text = "connection()";`
    );
    expect(
      createSourceGraph(root).boundaries(['apps/web/src/page.tsx'])
    ).toEqual({ serverActions: [], after: [], connection: [], useCache: [] });
  });
  it('retains unresolved first-party edges as migration blockers', () => {
    const { root, write } = fixture();
    write(
      'apps/web/src/page.ts',
      `import '@/missing'; import '@tuturuuu/missing'; import './image.png'; import './legal.css?raw';`
    );
    const graph = createSourceGraph(`${root}/`);
    graph.boundaries(['apps/web/src/page.ts']);
    expect(graph.modules.get('apps/web/src/page.ts')?.unresolved).toEqual([
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
  it('moves only the nine static public documents and retains all five Vercel schedules', () => {
    expect(
      manifest.routes
        .filter(
          (route) =>
            route.disposition === 'native-Start' && route.category === 'page'
        )
        .map((route) => route.pattern)
    ).toEqual([
      '/[locale]/acceptable-use',
      '/[locale]/community-guidelines',
      '/[locale]/legal/dpa',
      '/[locale]/legal/sla',
      '/[locale]/legal/subprocessors',
      '/[locale]/privacy',
      '/[locale]/security/bug-bounty',
      '/[locale]/security/policy',
      '/[locale]/terms',
    ]);
    expect(manifest.summary.dispositions).toEqual({
      'native-Start': 10,
      'Next-fallback': manifest.summary.total - 10,
    });
    expect(manifest.crons).toHaveLength(5);
    expect(manifest.crons.every((cron) => cron.owner === 'vercel-web')).toBe(
      true
    );
    expect(manifest.serviceWorker).toMatchObject({
      url: '/serwist/sw.js',
      scope: '/',
      disposition: 'Next-fallback',
    });
    expect(
      manifest.routes
        .filter((route) => route.category === 'api-rewrite')
        .map((route) => route.owner)
        .sort()
    ).toEqual(['calendar', 'calendar', 'infrastructure', 'infrastructure']);
  });
});

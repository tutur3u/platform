import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runRegistries } from './cli';
import { classifyRouteFile, planRegistries } from './registry';

const meetFiles = [
  '[locale]/(app)/page.tsx',
  '[locale]/(app)/layout.tsx',
  '[locale]/[wsId]/meetings/[meetingId]/page.tsx',
  '[locale]/r/[code]/page.tsx',
  '[locale]/r/[code]/preview/route.ts',
  'api/auth/logout/route.ts',
  'api/meet-call/[meetingId]/programming/preview/[port]/[[...path]]/route.ts',
  'api/meet-live/memory/route.ts',
];
const strip = { '[locale]': { locale: 'en' } };

describe('route file classification', () => {
  it('derives app-relative patterns and implied params', () => {
    expect(classifyRouteFile('[locale]/(app)/page.tsx', strip)).toEqual({
      file: '[locale]/(app)/page.tsx',
      kind: 'page',
      pattern: '/',
      defaults: { locale: 'en' },
    });
    expect(classifyRouteFile('api/x/route.ts', strip)).toMatchObject({
      kind: 'route',
      pattern: '/api/x',
    });
    expect(classifyRouteFile('[locale]/layout.tsx', strip)).toBeNull();
    expect(classifyRouteFile('@modal/page.tsx')).toMatchObject({
      error: expect.stringContaining('parallel'),
    });
    expect(classifyRouteFile('(.)photo/page.tsx')).toMatchObject({
      error: expect.stringContaining('intercepting'),
    });
  });
});

describe('registry planning', () => {
  it('generates every route and page with stable imports', () => {
    const plan = planRegistries(
      {
        stripSegments: strip,
        api: { out: 'src/runtime/api-registry.bridge.gen.ts' },
        pages: { out: 'src/runtime/page-registry.bridge.gen.ts' },
      },
      meetFiles,
      () => true
    );
    expect(plan.errors).toEqual([]);
    const [api, pages] = plan.generated;
    expect(api?.content).toContain(
      "import * as route0 from '../app/[locale]/r/[code]/preview/route';"
    );
    expect(api?.content).toContain(
      '{ pattern: "/r/[code]/preview", module: route0, defaults: { "locale": "en" } },'
    );
    expect(api?.content).toContain('pattern: "/api/meet-live/memory"');
    expect(pages?.content).toContain(
      '{ pattern: "/[wsId]/meetings/[meetingId]", file: "src/app/[locale]/[wsId]/meetings/[meetingId]/page.tsx", defaults: { "locale": "en" } },'
    );
    expect(pages?.content).toContain('export type PagePattern');
  });

  it('fails on any unregistered route or page when no registry is generated', () => {
    const plan = planRegistries(
      { owned: { 'api/build-info/route.ts': 'src/native/api.server.ts' } },
      ['api/build-info/route.ts', 'api/new/route.ts', '[locale]/page.tsx'],
      () => true
    );
    expect(plan.errors).toEqual([
      'src/app/[locale]/page.tsx: unregistered page; generate a registry, or declare it in "owned"/"ignored"',
      'src/app/api/new/route.ts: unregistered route; generate a registry, or declare it in "owned"/"ignored"',
    ]);
  });

  it('fails on missing owners, empty reasons, stale declarations and duplicates', () => {
    const plan = planRegistries(
      {
        api: { out: 'gen.ts' },
        owned: { 'api/a/route.ts': 'src/missing.ts' },
        ignored: { 'api/b/route.ts': ' ', 'api/gone/route.ts': 'removed' },
      },
      [
        'api/a/route.ts',
        'api/b/route.ts',
        '(x)/api/c/route.ts',
        'api/c/route.ts',
      ],
      (path) => path !== 'src/missing.ts'
    );
    expect(plan.errors).toEqual([
      'api/a/route.ts: owner src/missing.ts does not exist',
      'api/b/route.ts: an ignored route needs a reason',
      'api/gone/route.ts: declared in owned/ignored but no such route file',
      'api/c/route.ts: route pattern /api/c duplicates (x)/api/c/route.ts',
    ]);
  });
});

describe('registry CLI', () => {
  it('writes, then checks clean, then fails after a new route appears', () => {
    const root = mkdtempSync(join(tmpdir(), 'start-bridge-'));
    const write = (path: string, content = 'export {};\n') => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    };
    write(
      'start-bridge.routes.json',
      JSON.stringify({ api: { out: 'src/runtime/api.bridge.gen.ts' } })
    );
    write('src/app/api/a/route.ts');
    expect(runRegistries(root, 'check')).toEqual([
      'src/runtime/api.bridge.gen.ts: stale; run start-bridge-routes generate ' +
        root,
    ]);
    mkdirSync(join(root, 'src/runtime'), { recursive: true });
    expect(runRegistries(root, 'generate')).toEqual([]);
    expect(runRegistries(root, 'check')).toEqual([]);
    expect(
      readFileSync(join(root, 'src/runtime/api.bridge.gen.ts'), 'utf8')
    ).toContain("from '../app/api/a/route'");
    write('src/app/api/b/route.ts');
    expect(runRegistries(root, 'check')).toHaveLength(1);
    expect(runRegistries(join(root, 'nope'), 'check')[0]).toContain(
      'missing start-bridge.routes.json'
    );
  });
});

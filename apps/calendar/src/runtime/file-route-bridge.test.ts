import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../..');
const source = (path: string) => readFileSync(resolve(appRoot, path), 'utf8');

describe('Calendar public Start route producer', () => {
  it('uses the integrated generator with paths relative to the default src directory', () => {
    const config = source('vite.config.mts');
    expect(config).toContain('enableRouteGeneration: true');
    expect(config).toContain("routesDirectory: 'routes'");
    expect(config).toContain("generatedRouteTree: 'routeTree.gen.ts'");
    expect(config).toContain('routeTreeFileHeader: []');
    expect(config).not.toContain('enableRouteGeneration: false');
    expect(config).not.toContain("generatedRouteTree: './src/");
    expect(source('src/router.tsx')).toContain("from './routeTree.gen'");
    expect(source('src/router.tsx')).not.toContain('addChildren');
  });
  it('keeps the public root, index and splat topology and existing loader transports', () => {
    const root = source('src/routes/__root__.tsx');
    const index = source('src/routes/index.tsx');
    const splat = source('src/routes/$.tsx');
    expect(root).toContain('createRootRoute(');
    expect(root).toContain('loadCalendarLocale(');
    expect(index).toContain("createFileRoute('/')");
    expect(splat).toContain("createFileRoute('/$')");
    for (const route of [index, splat]) {
      expect(route).toContain('loadCalendarPage(');
      expect(route).toContain('Route.useLoaderData()');
    }
  });
  it('keeps the document and error shell independent of router registration', () => {
    const shell = source('src/runtime/router-shell.tsx');
    expect(shell).not.toMatch(/from ['"](?:\.\.\/|\.\/)router['"]/u);
    expect(shell).not.toContain('useRouteContext');
    expect(shell).toContain("match.routeId === '__root__'");
    expect(shell).toContain("context.locale === 'vi'");
    expect(shell).toContain('context: unknown');
  });
});

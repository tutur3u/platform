import { describe, expect, it, vi } from 'vitest';
import { dispatchEndpoint, lazyRouteModule } from '../core/endpoints';
import { exportedMethods, planRegistries } from './registry';

describe('exportedMethods', () => {
  it('reads every export form a route uses', () => {
    expect(
      exportedMethods(`
        import { x } from './x';
        export async function GET() {}
        export const POST = handler;
        export const { PUT, PATCH: renamed } = toHandlers(x);
        export { remove as DELETE, type Helper };
        // export function HEAD() {}
        /* export function OPTIONS() {} */
        export const dynamic = 'force-dynamic';
      `)
    ).toEqual(['GET', 'POST', 'PUT', 'DELETE']);
  });

  it('cannot see through a star re-export', () => {
    expect(exportedMethods("export * from './shared';")).toBeNull();
  });
});

describe('lazy API registry', () => {
  const sources: Record<string, string> = {
    'src/app/api/sync/route.ts': 'export async function POST() {}',
    'src/app/api/shared/route.ts': "export * from '../base';",
  };
  const plan = (lazy: boolean) =>
    planRegistries(
      { api: { out: 'src/start-bridge/api.gen.ts', lazy } },
      ['api/sync/route.ts', 'api/shared/route.ts'],
      () => true,
      (path) => sources[path] ?? ''
    ).generated[0]?.content ?? '';

  it('imports routes on first use, keeping star re-exports eager', () => {
    const content = plan(true);
    expect(content).toContain('  lazyRouteModule,');
    expect(content).toContain(
      `module: lazyRouteModule(() => import('../app/api/sync/route'), ["POST"])`
    );
    expect(content).toContain(
      "import * as route0 from '../app/api/shared/route';"
    );
    expect(content).not.toContain("import * as route1 from '../app/api/sync");
  });

  it('stays eager unless lazy is requested', () => {
    expect(plan(false)).not.toContain('lazyRouteModule');
  });
});

describe('lazyRouteModule', () => {
  it('answers OPTIONS and 405 without loading; loads once on first call', async () => {
    const load = vi.fn(async () => ({
      POST: async () => new Response('posted', { status: 201 }),
    }));
    const endpoints = [
      { pattern: '/api/sync', module: lazyRouteModule(load, ['POST']) },
    ];
    const options = await dispatchEndpoint(
      endpoints,
      new Request('https://x.test/api/sync', { method: 'OPTIONS' })
    );
    expect(options?.status).toBe(204);
    const wrong = await dispatchEndpoint(
      endpoints,
      new Request('https://x.test/api/sync')
    );
    expect(wrong?.status).toBe(405);
    expect(load).not.toHaveBeenCalled();
    for (let index = 0; index < 2; index++) {
      const posted = await dispatchEndpoint(
        endpoints,
        new Request('https://x.test/api/sync', { method: 'POST' })
      );
      expect(posted?.status).toBe(201);
    }
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reports a statically read method the module does not export', async () => {
    const module = lazyRouteModule(async () => ({}), ['GET']);
    await expect((module.GET as () => Promise<unknown>)()).rejects.toThrow(
      'no GET export'
    );
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('server-only', () => ({}));
const { guard } = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock('./authorization', () => ({ requireDevboxActor: guard }));
vi.mock('./collector-auth', () => ({ authorizeDevboxCollector: guard }));
vi.mock('./agent-auth', () => ({ authorizeDevboxAgent: guard }));
vi.mock('./agent-traffic-gate', () => ({
  isDevboxAgentApiEnabled: () => true,
  createDevboxAgentApiDisabledResponse: vi.fn(),
}));
const handlers = import.meta.glob('../../app/api/v1/devboxes/**/route.ts');
beforeEach(() => {
  guard.mockReset();
  guard.mockResolvedValue({
    ok: false,
    response: new Response(null, { status: 401 }),
  });
});
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const base = resolve(root, 'apps/web/src/app/api/v1/devboxes');
function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? routes(resolve(dir, entry.name))
      : entry.name === 'route.ts'
        ? [resolve(dir, entry.name)]
        : []
  );
}
// Every public credential boundary is explicitly inventoried. A new route must
// select an actor policy and join this matrix before CI accepts it.
const matrix = {
  'access-tokens/route.ts': ['GET', 'POST'],
  'access-tokens/[tokenId]/route.ts': ['DELETE'],
  'grant/accept/route.ts': ['POST'],
  'agents/events/route.ts': ['POST'],
  'agents/heartbeat/route.ts': ['POST'],
  'agents/playground-files/route.ts': ['POST'],
  'agents/poll/route.ts': ['GET'],
  'agents/register/route.ts': ['POST'],
  'agents/shutdown/route.ts': ['POST'],
  'cache/prune/route.ts': ['POST'],
  'cache/route.ts': ['GET'],
  'quota-raises/route.ts': ['POST'],
  'usage/ingest/route.ts': ['POST'],
  'env/route.ts': ['POST'],
  'leases/[leaseId]/release/route.ts': ['POST'],
  'leases/route.ts': ['POST'],
  'previews/route.ts': ['POST'],
  'runs/[runId]/logs/route.ts': ['GET'],
  'runs/[runId]/route.ts': ['GET'],
  'runs/[runId]/stop/route.ts': ['POST'],
  'runs/route.ts': ['GET', 'POST'],
  'runs/stop-by-key/route.ts': ['POST'],
};
describe('devbox entry-point matrix', () => {
  it('inventories every live route and method', () => {
    expect(
      routes(base)
        .map((p) => relative(base, p))
        .sort()
    ).toEqual(Object.keys(matrix).sort());
  });
  for (const [path, methods] of Object.entries(matrix)) {
    for (const method of methods) {
      it(`${method} ${path} refuses an anonymous request before any work`, async () => {
        const load = handlers[`../../app/api/v1/devboxes/${path}`];
        expect(load).toBeDefined();
        const module = await load?.();
        const handler =
          module && typeof module === 'object' && method in module
            ? Reflect.get(module, method)
            : null;
        expect(typeof handler).toBe('function');
        const req = new Request(
          `https://example.test/api/v1/devboxes/${path.replace('/route.ts', '')}`,
          { method }
        );
        const response = await handler(req, {
          params: Promise.resolve({
            runId: 'unknown',
            leaseId: 'unknown',
            tokenId: 'unknown',
          }),
        });
        expect(response.status).toBe(401);
        expect(guard).toHaveBeenCalledOnce();
      });
    }
    it(`${path} guards ${methods.join(', ')} before store access`, () => {
      const source = readFileSync(resolve(base, path), 'utf8');
      expect(source).not.toContain('legacy-api-routes');
      for (const method of methods) {
        const handler = source.split(`export async function ${method}(`)[1];
        expect(handler, method).toBeDefined();
        expect(handler?.split(/export async function/)[0]).toMatch(
          /await (requireDevboxActor|authorizeDevboxAgent|authorizeDevboxCollector)\(request/
        );
      }
    });
  }
  it('runner wrapper delegates to the central actor guard', () => {
    expect(
      readFileSync(
        resolve(root, 'apps/web/src/lib/devboxes/agent-auth.ts'),
        'utf8'
      )
    ).toContain('return requireDevboxActor(request');
  });
  it('control Worker gates every credential path', () => {
    const source = readFileSync(
      resolve(root, 'apps/devbox-control/src/worker.ts'),
      'utf8'
    );
    const inventory = [
      ...new Set(
        [...source.matchAll(/'(\/(?:health|v1\/[a-z-]+))'/g)].map(
          (match) => match[1]
        )
      ),
    ].sort();
    expect(inventory).toEqual([
      '/health',
      '/v1/connect',
      '/v1/heartbeat',
      '/v1/notify',
      '/v1/poll',
    ]);
    expect(source).toContain('await requireDevboxActor(request, env');
    expect(source).toContain('TUTURUUU_DEVBOX_AGENT_API_ENABLED');
    expect(source).toContain("['/v1/heartbeat', '/v1/poll', '/v1/connect']");
    expect(source).toContain(
      "await requireDevboxActor(request, env, 'internal')"
    );
  });
  it('inventories Infrastructure devbox routes and their central role adapters', () => {
    const base = resolve(
      root,
      'apps/infrastructure/src/app/api/v1/infrastructure/devboxes'
    );
    const inventory = [
      'route.ts',
      'runners/[runnerId]/drain/route.ts',
      'runners/[runnerId]/features/route.ts',
      'runs/reap-stale/route.ts',
      'quota-raises/[id]/route.ts',
    ];
    expect(
      routes(base)
        .map((p) => relative(base, p))
        .sort()
    ).toEqual(inventory.sort());
    for (const path of inventory) {
      expect(readFileSync(resolve(base, path), 'utf8')).toMatch(
        /await authorizeDevboxRoot(?:Member|Admin|Viewer)\(request/
      );
    }
    const source = readFileSync(
      resolve(root, 'apps/infrastructure/src/lib/devboxes/authorization.ts'),
      'utf8'
    );
    expect(source).toContain('export async function requireDevboxActor');
    for (const role of ['member', 'viewer', 'admin'])
      expect(source).toContain(`requireDevboxActor(request, '${role}')`);
  });
});

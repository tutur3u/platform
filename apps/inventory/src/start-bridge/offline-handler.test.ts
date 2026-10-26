import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as offlineRoute from '../app/api/v1/workspaces/[wsId]/inventory/offline-mutations/route';
import { createInventoryHandler } from './handler';

const mocks = vi.hoisted(() => ({ offline: vi.fn(), audience: vi.fn() }));
vi.mock('@tuturuuu/inventory-core/offline-create-route', () => ({
  handleOfflineCreate: mocks.offline,
}));
vi.mock('../proxy', () => ({ proxy: async () => NextResponse.next() }));
vi.mock('@tuturuuu/start-bridge/function-proxy', () => ({
  createFunctionProxy: (options: unknown) => {
    mocks.audience(options);
    return async () => NextResponse.next();
  },
}));

const operationId = '41892d98-b9e6-4c0d-9788-b21f2b4a2d82';
const serverId = '6ab768a9-cd1d-41a2-ad88-632a7c3a08f9';
const contract = 'inventory-offline-create-v1';
const path = '/api/v1/workspaces/workspace/inventory/offline-mutations';
const env = {
  ASSETS: { fetch: vi.fn(async () => new Response('asset')) },
  INTERNAL_WEB_API_ORIGIN: 'https://web.fixture.invalid',
};
const ctx = { waitUntil: (_work: Promise<unknown>) => {} };

beforeEach(() => vi.clearAllMocks());

it('serves both mounts through one handler and leaves the shared session cookie unchanged', async () => {
  const cookie = 'tuturuuu_app_session=fixture; Path=/; HttpOnly';
  mocks.offline.mockImplementation(async () =>
    Response.json({ id: serverId }, { headers: { 'Set-Cookie': cookie } })
  );
  const handle = createInventoryHandler({
    start: { fetch: async () => new Response('Not Found', { status: 404 }) },
    endpoints: [
      {
        pattern: '/api/v1/workspaces/[wsId]/inventory/offline-mutations',
        module: offlineRoute,
      },
    ],
    publicAssets: new Set(['/robots.txt']),
  });
  for (const base of [
    'https://inventory.tuturuuu.com',
    'https://tuturuuu.com/inventory',
  ]) {
    const response = await handle(
      new Request(`${base}${path}`, { method: 'POST', body: '{}' }),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([cookie]);
    expect(mocks.offline).toHaveBeenLastCalledWith(
      expect.any(Request),
      'workspace'
    );
  }
  expect(
    (
      await handle(
        new Request(`https://tuturuuu.com/inventory-other${path}`),
        env,
        ctx
      )
    ).status
  ).toBe(404);
});

describe.each(['', '/inventory'])(
  'Inventory bridge offline contract at %s',
  (basePath) => {
    function handler() {
      return createInventoryHandler({
        basePath,
        start: {
          fetch: async () => new Response('Not Found', { status: 404 }),
        },
        endpoints: [
          {
            pattern: '/api/v1/workspaces/[wsId]/inventory/offline-mutations',
            module: offlineRoute,
          },
        ],
        publicAssets: new Set(['/robots.txt']),
      });
    }

    it('passes the unchanged operation/workspace through the existing route and preserves replay receipts', async () => {
      const receipts = new Set<string>();
      mocks.offline.mockImplementation(async (request: Request) => {
        const body = await request.json();
        const replayed = receipts.has(body.operation_id);
        receipts.add(body.operation_id);
        return Response.json(
          { contract, resource: 'category', replayed, data: { id: serverId } },
          {
            status: replayed ? 200 : 201,
            headers: { 'X-Tuturuuu-Offline-Contract': contract },
          }
        );
      });
      const handle = handler();
      for (const status of [201, 200]) {
        const response = await handle(
          new Request(`https://inventory.fixture.invalid${basePath}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              operation_id: operationId,
              kind: 'category',
              payload: { name: 'Original' },
            }),
          }),
          env,
          ctx
        );
        expect(response.status).toBe(status);
        expect(response.headers.get('X-Tuturuuu-Offline-Contract')).toBe(
          contract
        );
        expect(await response.json()).toEqual({
          contract,
          resource: 'category',
          replayed: status === 200,
          data: { id: serverId },
        });
        expect(mocks.offline).toHaveBeenLastCalledWith(
          expect.any(Request),
          'workspace'
        );
      }
      expect(receipts).toEqual(new Set([operationId]));
      expect(mocks.offline).toHaveBeenCalledTimes(2);
      expect(mocks.audience).toHaveBeenCalledWith({ targetApp: 'inventory' });
    });

    it('retains a contract error without retry or central fallback', async () => {
      mocks.offline.mockResolvedValue(
        Response.json(
          { code: 'OFFLINE_CONTRACT_UNAVAILABLE' },
          { status: 503, headers: { 'X-Tuturuuu-Offline-Contract': contract } }
        )
      );
      const response = await handler()(
        new Request(`https://inventory.fixture.invalid${basePath}${path}`, {
          method: 'POST',
          body: '{}',
        }),
        env,
        ctx
      );
      expect(response.status).toBe(503);
      expect(response.headers.get('X-Tuturuuu-Offline-Contract')).toBe(
        contract
      );
      expect(mocks.offline).toHaveBeenCalledTimes(1);
    });

    it('does not serve an invented worker or allow GET to become a mutation', async () => {
      const handle = handler();
      const worker = await handle(
        new Request(
          `https://inventory.fixture.invalid${basePath}/serwist/sw.js`
        ),
        env,
        ctx
      );
      expect(worker.status).toBe(404);
      const wrongMethod = await handle(
        new Request(`https://inventory.fixture.invalid${basePath}${path}`),
        env,
        ctx
      );
      expect(wrongMethod.status).toBe(405);
      expect(wrongMethod.headers.get('Allow')).toContain('POST');
      expect(mocks.offline).not.toHaveBeenCalled();
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    });
  }
);

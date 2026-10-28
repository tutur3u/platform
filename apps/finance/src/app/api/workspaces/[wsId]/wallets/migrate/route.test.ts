import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveSatelliteRequestActor: vi.fn(),
  getPermissions: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  schema: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  resolveSatelliteRequestActor: mocks.resolveSatelliteRequestActor,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
  createAdminClient: mocks.createAdminClient,
}));

const workspaceW = '11111111-1111-4111-8111-111111111111';
const workspaceX = '22222222-2222-4222-8222-222222222222';
const foreignWalletId = '33333333-3333-4333-8333-333333333333';
const disabled = {
  error: 'MIGRATION_DISABLED',
  message:
    'This workspace migration endpoint is no longer available. Use maintained database migrations or local backfill scripts instead.',
};
const forbidden = {
  error: 'Forbidden',
  message:
    'Infrastructure migration routes are only accessible in development mode',
  hint: 'These routes are intended for internal data migration and should not be used in production.',
};

type Handler = (
  request: Request,
  context: { params: Promise<{ wsId: string }> }
) => Promise<Response> | Response;

function foreignWalletRequest(method = 'PUT') {
  return new Request(
    `http://localhost/api/workspaces/${workspaceW}/wallets/migrate`,
    {
      method,
      body: JSON.stringify({
        id: foreignWalletId,
        wallets: [
          {
            id: foreignWalletId,
            ws_id: workspaceX,
            name: 'Foreign wallet',
            currency: 'VND',
            balance: 42,
          },
        ],
      }),
    }
  );
}

function expectNoDatabaseAccess() {
  for (const mock of Object.values(mocks)) {
    expect(mock).not.toHaveBeenCalled();
  }
}

describe('SR-362 retired wallet migration route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSatelliteRequestActor.mockResolvedValue({
      user: { id: 'workspace-w-member' },
      admin: { schema: mocks.schema },
    });
    mocks.getPermissions.mockResolvedValue({
      wsId: workspaceW,
      withoutPermission: () => true,
    });
    mocks.schema.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ upsert: mocks.upsert });
    mocks.upsert.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ error: null });
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    { environment: 'development', status: 410, body: disabled },
    { environment: 'production', status: 403, body: forbidden },
    { environment: 'test', status: 403, body: forbidden },
    { environment: undefined, status: 403, body: forbidden },
  ])(
    'SR-362 rejects a member of W submitting a wallet from X in $environment',
    async ({ environment, status, body }) => {
      vi.stubEnv('NODE_ENV', environment);
      const { PUT } = await import('./route');
      const handler: Handler = PUT;
      const response = await handler(foreignWalletRequest(), {
        params: Promise.resolve({ wsId: workspaceW }),
      });

      expect.soft(response.status).toBe(status);
      await expect.soft(response.json()).resolves.toEqual(body);
      expectNoDatabaseAccess();
    }
  );

  describe.each([
    { environment: 'development', status: 410, body: disabled },
    { environment: 'production', status: 403, body: forbidden },
  ])(
    'SR-362 terminal contract in $environment',
    ({ environment, status, body }) => {
      beforeEach(() => vi.stubEnv('NODE_ENV', environment));

      it.each(['', '{invalid json', JSON.stringify({ wallets: [null] })])(
        'SR-362 ignores body %j without resolving an actor or params',
        async (payload) => {
          mocks.resolveSatelliteRequestActor.mockResolvedValue(null);
          const { PUT } = await import('./route');
          const handler: Handler = PUT;
          const request = new Request('http://localhost/wallets/migrate', {
            method: 'PUT',
            body: payload,
          });
          const parseBody = vi.spyOn(request, 'json');
          const response = await handler(request, {
            get params(): Promise<{ wsId: string }> {
              throw new Error('Retired endpoint must not resolve params');
            },
          });

          expect(response.status).toBe(status);
          await expect(response.json()).resolves.toEqual(body);
          expect(parseBody).not.toHaveBeenCalled();
          expectNoDatabaseAccess();
        }
      );

      it.each(['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] as const)(
        'SR-362 rejects %s with 405 and Allow PUT without database access',
        async (method) => {
          const route = await import('./route');
          const handler: Handler = route[method];
          const request =
            method === 'GET' || method === 'HEAD'
              ? new Request('http://localhost/wallets/migrate', { method })
              : foreignWalletRequest(method);
          const parseBody = vi.spyOn(request, 'json');
          const response = await handler(request, {
            params: Promise.resolve({ wsId: workspaceW }),
          });

          expect(response.status).toBe(405);
          expect(response.headers.get('allow')).toBe('PUT');
          await expect(response.json()).resolves.toEqual({
            error: 'method not allowed',
          });
          expect(parseBody).not.toHaveBeenCalled();
          expectNoDatabaseAccess();
        }
      );
    }
  );
});

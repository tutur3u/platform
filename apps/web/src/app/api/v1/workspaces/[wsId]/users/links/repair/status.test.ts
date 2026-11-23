import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const deps = vi.hoisted(() => ({
  authorize: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
  blocked: vi.fn(),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: deps.authorize,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: deps.admin,
}));

const workspaceUserId = '07400000-0000-4000-8000-000000000011';
const invitationId = '07400000-0000-4000-8000-000000000012';
const accountId = '07400000-0000-4000-8000-000000000013';

function read(contactId: string | null = workspaceUserId) {
  const url = new URL('https://example.test/repair');
  if (contactId) url.searchParams.set('workspaceUserId', contactId);
  return GET(new Request(url), {
    params: Promise.resolve({ wsId: 'workspace' }),
  });
}

describe('contact account-link invitation status', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    deps.blocked.mockReturnValue(false);
    deps.authorize.mockResolvedValue({
      context: {
        normalizedWsId: 'verified-workspace',
        user: { id: 'verified-actor' },
        permissions: { withoutPermission: deps.blocked },
      },
    });
    deps.admin.mockResolvedValue({ schema: () => ({ rpc: deps.rpc }) });
  });

  it('returns the unauthenticated response before reading', async () => {
    const unauthorized = new Response(null, { status: 401 });
    deps.authorize.mockResolvedValue({ response: unauthorized });
    const response = await read();
    expect(response.status).toBe(401);
    expect(deps.admin).not.toHaveBeenCalled();
  });

  it.each([
    'update_users',
    'view_users_private_info',
    'view_users_public_info',
  ])('requires %s, matching the invite permission', async (missing) => {
    deps.blocked.mockImplementation((permission) => permission === missing);
    const response = await read();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ outcome: 'forbidden' });
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it('rejects a missing or malformed contact id', async () => {
    expect((await read(null)).status).toBe(400);
    expect((await read('not-a-uuid')).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it('reads with the verified workspace and actor and returns the state', async () => {
    const invitation = {
      state: 'pending',
      invitationId,
      accountId,
      updatedAt: '2026-11-23T12:00:00+00:00',
      expiresAt: '2026-11-24T12:00:00+00:00',
    };
    deps.rpc.mockResolvedValue({ data: invitation, error: null });
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ invitation });
    expect(deps.rpc).toHaveBeenCalledWith(
      'read_contact_account_link_invitation',
      {
        p_ws_id: 'verified-workspace',
        p_contact_id: workspaceUserId,
        p_actor_id: 'verified-actor',
      }
    );
  });

  it('returns null when the contact has no invitation history', async () => {
    deps.rpc.mockResolvedValue({ data: null, error: null });
    const response = await read();
    expect(await response.json()).toEqual({ invitation: null });
  });

  it.each([
    [{ data: null, error: { code: '42501' } }, 403, 'forbidden'],
    [{ data: null, error: { code: 'XX000' } }, 500, 'unavailable'],
    [{ data: { state: 'unknown' }, error: null }, 500, 'unavailable'],
  ])('maps RPC result %j to HTTP %i', async (rpc, status, outcome) => {
    deps.rpc.mockResolvedValue(rpc);
    const response = await read();
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ outcome });
  });
});

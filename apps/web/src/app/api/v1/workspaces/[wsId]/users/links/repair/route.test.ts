import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

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
const platformAccountId = '07400000-0000-4000-8000-000000000013';

function submit(
  body: unknown,
  origin = 'https://example.test',
  contentType = 'application/json'
) {
  return POST(
    new Request('https://example.test/repair', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': contentType, Origin: origin },
    }),
    { params: Promise.resolve({ wsId: 'workspace' }) }
  );
}

describe('contact account-link confirmation', () => {
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

  it('fails closed for legacy email-based repair, including an edited contact email', async () => {
    const response = await submit({ workspaceUserId });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ outcome: 'confirmation_required' });
    expect(deps.admin).not.toHaveBeenCalled();
  });

  it.each([
    'update_users',
    'view_users_private_info',
    'view_users_public_info',
  ])('requires %s to issue an invitation', async (missing) => {
    deps.blocked.mockImplementation((permission) => permission === missing);
    const response = await submit({
      action: 'invite',
      workspaceUserId,
      platformAccountId,
    });
    expect(response.status).toBe(403);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it('does not accept a caller-supplied confirmation actor', async () => {
    const response = await submit({
      action: 'confirm',
      workspaceUserId,
      invitationId,
      platformAccountId,
    });
    expect(response.status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it.each(['confirm', 'decline'])(
    'rejects a different origin for %s',
    async (action) => {
      const response = await submit(
        { action, workspaceUserId, invitationId },
        'https://other.example.test'
      );
      expect(response.status).toBe(403);
      expect(deps.authorize).not.toHaveBeenCalled();
    }
  );

  it('does not read plain-text submissions', async () => {
    const response = await submit(
      { action: 'confirm', workspaceUserId, invitationId },
      'https://example.test',
      'text/plain'
    );
    expect(response.status).toBe(415);
    expect(deps.authorize).not.toHaveBeenCalled();
  });

  it('uses the authorized operator to revoke the contact invitation', async () => {
    deps.rpc.mockResolvedValue({ data: 'revoked', error: null });
    const response = await submit({ action: 'revoke', workspaceUserId });
    expect(response.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith(
      'finish_contact_account_link_invitation',
      {
        p_ws_id: 'verified-workspace',
        p_actor_id: 'verified-actor',
        p_contact_id: workspaceUserId,
        p_invitation_id: null,
        p_action: 'revoke',
      }
    );
  });

  it('rejects cross-origin unlink before resolving the actor', async () => {
    const response = await submit(
      { action: 'unlink', workspaceUserId, platformAccountId },
      'https://other.example.test'
    );
    expect(response.status).toBe(403);
    expect(deps.authorize).not.toHaveBeenCalled();
  });

  it('passes the authenticated unlink actor and returns only the outcome', async () => {
    deps.rpc.mockResolvedValue({ data: 'unlinked', error: null });
    const response = await submit({
      action: 'unlink',
      workspaceUserId,
      platformAccountId,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: 'unlinked' });
    expect(deps.rpc).toHaveBeenCalledWith('unlink_contact_account_link', {
      p_ws_id: 'verified-workspace',
      p_actor_id: 'verified-actor',
      p_contact_id: workspaceUserId,
      p_account_id: platformAccountId,
    });
  });

  it.each([
    [{ data: null, error: { code: '42501' } }, 403, 'forbidden'],
    [{ data: 'ineligible', error: null }, 409, 'ineligible'],
  ])('maps unlink RPC result %j to HTTP %i', async (rpc, status, outcome) => {
    deps.rpc.mockResolvedValue(rpc);
    const response = await submit({
      action: 'unlink',
      workspaceUserId,
      platformAccountId,
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ outcome });
  });

  it('uses the verified account holder and returns only the outcome', async () => {
    deps.rpc.mockResolvedValue({ data: 'linked', error: null });
    const response = await submit({
      action: 'confirm',
      workspaceUserId,
      invitationId,
    });
    expect(response.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith('confirm_contact_account_link', {
      p_ws_id: 'verified-workspace',
      p_actor_id: 'verified-actor',
      p_contact_id: workspaceUserId,
      p_invitation_id: invitationId,
    });
    expect(await response.json()).toEqual({ outcome: 'linked' });
  });
});

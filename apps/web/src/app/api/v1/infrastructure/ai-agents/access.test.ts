import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAiAgentAdmin } from './access';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: unknown[]) => mocks.getPermissions(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (...args: unknown[]) =>
    mocks.resolveSessionAuthContext(...args),
}));

function request() {
  return new Request(
    'http://localhost/api/v1/infrastructure/ai-agents'
  ) as unknown as NextRequest;
}

describe('requireAiAgentAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue({ id: 'admin-client' });
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: { id: 'session-client' },
      user: { email: 'root@example.com', id: 'user-1' },
    });
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn().mockReturnValue(false),
    });
  });

  it('accepts chat app-session auth before checking root AI-agent permissions', async () => {
    const result = await requireAiAgentAdmin(request());

    expect(result.ok).toBe(true);
    expect(mocks.resolveSessionAuthContext).toHaveBeenCalledWith(
      expect.anything(),
      {
        allowAppSessionAuth: { targetApp: 'chat' },
      }
    );
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: { email: 'root@example.com', id: 'user-1' },
      wsId: ROOT_WORKSPACE_ID,
    });
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
  });

  it('rejects authenticated users without root secret-management permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn().mockReturnValue(true),
    });

    const result = await requireAiAgentAdmin(request());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });
});

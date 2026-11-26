import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildMiraContext: vi.fn(),
  buildMiraSystemInstruction: vi.fn(),
  createMiraStreamTools: vi.fn(),
  getPermissions: vi.fn(),
  resolveWorkspaceContextState: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('../../tools/context-builder', () => ({
  buildMiraContext: (...args: Parameters<typeof mocks.buildMiraContext>) =>
    mocks.buildMiraContext(...args),
}));

vi.mock('../../tools/mira-tools', () => ({
  createMiraStreamTools: (
    ...args: Parameters<typeof mocks.createMiraStreamTools>
  ) => mocks.createMiraStreamTools(...args),
}));

vi.mock('../../tools/workspace-context', () => ({
  resolveWorkspaceContextState: (
    ...args: Parameters<typeof mocks.resolveWorkspaceContextState>
  ) => mocks.resolveWorkspaceContextState(...args),
}));

vi.mock('../mira-system-instruction', () => ({
  buildMiraSystemInstruction: (
    ...args: Parameters<typeof mocks.buildMiraSystemInstruction>
  ) => mocks.buildMiraSystemInstruction(...args),
}));

describe('prepareMiraRuntime security boundaries', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      ok: true,
      membershipType: 'MEMBER',
    });
    mocks.getPermissions.mockResolvedValue({ withoutPermission: () => false });
    mocks.buildMiraContext.mockResolvedValue({
      contextString: 'ctx',
      soul: null,
      isFirstInteraction: false,
    });
    mocks.buildMiraSystemInstruction.mockReturnValue('instruction');
    mocks.createMiraStreamTools.mockReturnValue({});
  });

  it('enforces MEMBER membership and personal-workspace binding in authorizeWorkspaceTools', async () => {
    const sessionSupabase = {
      client: 'session',
    } as unknown as TypedSupabaseClient;
    const toolSupabase = { client: 'admin' } as unknown as TypedSupabaseClient;
    mocks.resolveWorkspaceContextState.mockResolvedValue({
      workspaceContextId: 'personal',
      wsId: 'personal-ws',
      name: 'Personal',
      personal: true,
      memberCount: 1,
    });

    const { prepareMiraRuntime } = await import('./route-mira-runtime');
    await prepareMiraRuntime({
      isMiraMode: true,
      wsId: 'personal-ws',
      workspaceContextId: 'shared-ws',
      request: new NextRequest('http://localhost/api/ai/chat'),
      userId: 'free-user-1',
      chatId: 'chat-1',
      supabase: sessionSupabase,
      toolSupabase,
      timezone: 'UTC',
      restrictToPersonalWorkspace: true,
    });

    expect(mocks.resolveWorkspaceContextState).toHaveBeenCalledWith({
      fallbackWorkspaceId: 'personal-ws',
      requestedWorkspaceContextId: 'shared-ws',
      restrictToPersonal: true,
      supabase: toolSupabase,
      userId: 'free-user-1',
    });

    const ctx = mocks.createMiraStreamTools.mock.calls[0]?.[0];
    expect(ctx.restrictToPersonalWorkspace).toBe(true);
    await expect(ctx.authorizeWorkspaceTools('shared-ws', [])).resolves.toBe(
      false
    );
    await expect(ctx.authorizeWorkspaceTools('personal-ws', [])).resolves.toBe(
      true
    );

    mocks.verifyWorkspaceMembershipType.mockResolvedValueOnce({
      ok: false,
      error: 'membership_type_mismatch',
      membershipType: 'GUEST',
    });
    await prepareMiraRuntime({
      isMiraMode: true,
      wsId: 'shared-ws',
      request: new NextRequest('http://localhost/api/ai/chat'),
      userId: 'guest-user',
      chatId: 'chat-2',
      supabase: sessionSupabase,
      toolSupabase,
      timezone: 'UTC',
    });
    const sharedCtx = mocks.createMiraStreamTools.mock.calls[1]?.[0];
    await expect(
      sharedCtx.authorizeWorkspaceTools('shared-ws', [])
    ).resolves.toBe(false);
  });
});

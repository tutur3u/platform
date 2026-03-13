import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildMiraContext: vi.fn(),
  buildMiraSystemInstruction: vi.fn(),
  createMiraStreamTools: vi.fn(),
  getPermissions: vi.fn(),
  resolveWorkspaceContextState: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
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

describe('prepareMiraRuntime', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.buildMiraContext.mockReset();
    mocks.buildMiraSystemInstruction.mockReset();
    mocks.createMiraStreamTools.mockReset();
    mocks.getPermissions.mockReset();
    mocks.resolveWorkspaceContextState.mockReset();
  });

  it('uses the authorized tool supabase client for Mira context resolution and tools', async () => {
    const sessionSupabase = {
      client: 'session',
    } as unknown as TypedSupabaseClient;
    const toolSupabase = { client: 'admin' } as unknown as TypedSupabaseClient;
    const withoutPermission = vi.fn(() => false);
    const resolvedWorkspaceContext = {
      workspaceContextId: 'workspace-2',
      wsId: 'workspace-2',
      name: 'Workspace Two',
      personal: false,
      memberCount: 4,
    };
    const tools = { get_my_tasks: { execute: vi.fn() } };

    mocks.resolveWorkspaceContextState.mockResolvedValue(
      resolvedWorkspaceContext
    );
    mocks.getPermissions.mockResolvedValue({ withoutPermission });
    mocks.buildMiraContext.mockResolvedValue({
      contextString: 'ctx',
      soul: null,
      isFirstInteraction: false,
    });
    mocks.buildMiraSystemInstruction.mockReturnValue('instruction');
    mocks.createMiraStreamTools.mockReturnValue(tools);

    const { prepareMiraRuntime } = await import('./route-mira-runtime');
    const result = await prepareMiraRuntime({
      isMiraMode: true,
      wsId: 'workspace-1',
      workspaceContextId: 'workspace-2',
      request: new NextRequest('http://localhost/api/ai/chat'),
      userId: 'user-1',
      chatId: 'chat-1',
      supabase: sessionSupabase,
      toolSupabase,
      timezone: 'UTC',
    });

    expect(mocks.resolveWorkspaceContextState).toHaveBeenCalledWith({
      fallbackWorkspaceId: 'workspace-1',
      requestedWorkspaceContextId: 'workspace-2',
      supabase: toolSupabase,
      userId: 'user-1',
    });
    expect(mocks.buildMiraContext).toHaveBeenCalledWith({
      supabase: toolSupabase,
      timezone: 'UTC',
      userId: 'user-1',
      wsId: 'workspace-2',
    });
    expect(mocks.createMiraStreamTools).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat-1',
        supabase: toolSupabase,
        userId: 'user-1',
        workspaceContext: resolvedWorkspaceContext,
        wsId: 'workspace-1',
      }),
      withoutPermission,
      undefined
    );
    expect(result).toEqual({
      miraSystemPrompt:
        'ctx\n\n## Workspace Context\n\nCurrent task/calendar/finance workspace context: Workspace Two (shared workspace).\nUse this workspace for "my tasks", "my calendar", and "my finance" requests. Only switch to another workspace when the user explicitly names a different workspace.\n\ninstruction',
      miraTools: tools,
    });
  });
});

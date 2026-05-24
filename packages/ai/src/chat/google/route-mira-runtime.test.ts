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
      withoutPermission,
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

  it('fails closed for permissioned Mira tools when permission resolution errors', async () => {
    const sessionSupabase = {
      client: 'session',
    } as unknown as TypedSupabaseClient;
    const toolSupabase = { client: 'admin' } as unknown as TypedSupabaseClient;

    mocks.resolveWorkspaceContextState.mockResolvedValue({
      workspaceContextId: 'workspace-2',
      wsId: 'workspace-2',
      name: 'Workspace Two',
      personal: false,
      memberCount: 4,
    });
    mocks.getPermissions.mockRejectedValue(new Error('boom'));
    mocks.buildMiraContext.mockResolvedValue({
      contextString: 'ctx',
      soul: null,
      isFirstInteraction: false,
    });
    mocks.buildMiraSystemInstruction.mockReturnValue('instruction');
    mocks.createMiraStreamTools.mockReturnValue({});

    const { prepareMiraRuntime } = await import('./route-mira-runtime');
    await prepareMiraRuntime({
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

    const deniedPermission = mocks.createMiraStreamTools.mock.calls[0]?.[1];
    expect(deniedPermission).toBeTypeOf('function');
    expect(deniedPermission?.('manage_finance')).toBe(true);
    expect(mocks.buildMiraContext).toHaveBeenCalledWith(
      expect.objectContaining({
        withoutPermission: expect.any(Function),
      })
    );
  });

  it('adds current task board and list context to the Mira system prompt', async () => {
    const sessionSupabase = {
      client: 'session',
    } as unknown as TypedSupabaseClient;
    const toolSupabase = { client: 'admin' } as unknown as TypedSupabaseClient;

    mocks.resolveWorkspaceContextState.mockResolvedValue({
      workspaceContextId: 'workspace-2',
      wsId: 'workspace-2',
      name: 'Workspace Two',
      personal: false,
      memberCount: 4,
    });
    mocks.getPermissions.mockResolvedValue({ withoutPermission: vi.fn() });
    mocks.buildMiraContext.mockResolvedValue({
      contextString: 'ctx',
      soul: null,
      isFirstInteraction: false,
    });
    mocks.buildMiraSystemInstruction.mockReturnValue('instruction');
    mocks.createMiraStreamTools.mockReturnValue({});

    const { prepareMiraRuntime } = await import('./route-mira-runtime');
    const result = await prepareMiraRuntime({
      isMiraMode: true,
      wsId: 'workspace-2',
      workspaceContextId: 'workspace-2',
      request: new NextRequest('http://localhost/api/ai/chat'),
      userId: 'user-1',
      chatId: 'chat-1',
      supabase: sessionSupabase,
      toolSupabase,
      timezone: 'UTC',
      taskBoardContext: {
        boardId: 'board-1',
        boardName: 'Launch board',
        selectedList: {
          id: 'list-2',
          name: 'Doing',
          status: 'active',
          position: 1,
        },
        lists: [
          {
            id: 'list-1',
            name: 'To Do',
            status: 'not_started',
            position: 0,
          },
          {
            id: 'list-2',
            name: 'Doing',
            status: 'active',
            position: 1,
          },
        ],
        workspaceId: 'workspace-2',
        workspaceName: 'Workspace Two',
      },
    });

    expect(result.miraSystemPrompt).toContain('## Current Task Board');
    expect(result.miraSystemPrompt).toContain(
      'The user is currently viewing workspace Workspace Two'
    );
    expect(result.miraSystemPrompt).toContain(
      'Current workspace id: workspace-2'
    );
    expect(result.miraSystemPrompt).toContain(
      'Current task board: Launch board (board-1)'
    );
    expect(result.miraSystemPrompt).toContain('Current board id: board-1');
    expect(result.miraSystemPrompt).toContain(
      'Selected/default task list: Doing [active] (list id: list-2).'
    );
    expect(result.miraSystemPrompt).toContain('To Do [not_started]');
    expect(result.miraSystemPrompt).toContain('Doing [active]');
    expect(result.miraSystemPrompt).toContain(
      'including ids that look like all-zero UUIDs'
    );
    expect(result.miraSystemPrompt).toContain(
      'do not call workspace context tools just to rediscover this board context.'
    );
  });
});

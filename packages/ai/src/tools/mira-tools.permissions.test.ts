import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIRA_TOOL_ACCESS_POLICY,
  MIRA_TOOL_PERMISSIONS,
} from './mira-tool-metadata';
import { MIRA_TOOL_NAMES } from './mira-tool-names';
import type { MiraToolContext } from './mira-tool-types';
import { createMiraStreamTools } from './mira-tools';

const dispatch = vi.hoisted(() =>
  vi.fn(async (_name: string, _args: unknown, ctx: MiraToolContext) => ({
    wsId: ctx.wsId,
  }))
);
vi.mock('./mira-tool-dispatcher', () => ({ executeMiraTool: dispatch }));
beforeEach(() => vi.clearAllMocks());
function invoke(
  tools: ReturnType<typeof createMiraStreamTools>,
  name: string,
  args: Record<string, unknown>
) {
  const execute = tools[name]?.execute as (
    input: Record<string, unknown>
  ) => Promise<unknown>;
  return execute(args);
}
describe('Mira workspace tool authorization', () => {
  it('does not reuse permissions from the previous workspace', async () => {
    const ctx = {
      wsId: 'allowed',
      userId: 'user',
      supabase: {},
      authorizeWorkspaceTools: vi.fn(
        async (wsId: string) => wsId === 'allowed'
      ),
    } as unknown as MiraToolContext;
    const tools = createMiraStreamTools(ctx, () => false);
    ctx.wsId = 'restricted';
    expect(
      await invoke(tools, 'create_board', { name: 'Test' })
    ).toHaveProperty('error');
    expect(dispatch).not.toHaveBeenCalled();
    const discovery = (await invoke(tools, 'search_tools', {
      query: 'create_board',
      limit: 1,
    })) as { selectedTools: string[] };
    expect(discovery.selectedTools).not.toContain('create_board');
  });
  it('pins execution to the authorized workspace when context changes while authorization awaits', async () => {
    let allow: ((value: boolean) => void) | undefined;
    const ctx = {
      wsId: 'first',
      userId: 'user',
      supabase: {},
      authorizeWorkspaceTools: () =>
        new Promise<boolean>((resolve) => {
          allow = resolve;
        }),
    } as unknown as MiraToolContext;
    const tools = createMiraStreamTools(ctx, () => false);
    const pending = invoke(tools, 'create_board', { name: 'Test' });
    ctx.wsId = 'second';
    allow?.(true);
    expect(await pending).toEqual({ wsId: 'first' });
  });
});

it('pins every discovery permission check to one workspace', async () => {
  const authorize = vi.fn(async (_wsId: string) => {
    ctx.wsId = 'second';
    return true;
  });
  const ctx = {
    wsId: 'first',
    userId: 'user',
    supabase: {},
    authorizeWorkspaceTools: authorize,
  } as unknown as MiraToolContext;
  await invoke(
    createMiraStreamTools(ctx, () => false),
    'search_tools',
    { query: 'tasks' }
  );
  expect(authorize.mock.calls.length).toBeGreaterThan(1);
  expect(authorize.mock.calls.every(([wsId]) => wsId === 'first')).toBe(true);
});

describe('Mira tool access policy coverage', () => {
  it('classifies every registered Mira tool explicitly and requires manage_drive for create_qr_code', () => {
    for (const toolName of MIRA_TOOL_NAMES) {
      expect(MIRA_TOOL_ACCESS_POLICY[toolName]).toBeDefined();
    }
    expect(MIRA_TOOL_PERMISSIONS.create_qr_code).toBe('manage_drive');
    expect(MIRA_TOOL_ACCESS_POLICY.create_qr_code).toBe('workspace_permission');
  });

  it('enforces authorizeWorkspaceTools on workspace_member tools such as time-tracking category mutations', async () => {
    const authorize = vi.fn(async () => false);
    const ctx = {
      wsId: 'shared-ws',
      userId: 'guest-user',
      supabase: {},
      authorizeWorkspaceTools: authorize,
    } as unknown as MiraToolContext;
    const tools = createMiraStreamTools(ctx, () => false);

    expect(
      await invoke(tools, 'delete_time_tracking_category', {
        categoryId: 'cat-1',
      })
    ).toHaveProperty('error');
    expect(authorize).toHaveBeenCalledWith('shared-ws', []);
    expect(dispatch).not.toHaveBeenCalled();

    expect(
      await invoke(tools, 'create_qr_code', { value: 'https://tuturuuu.com' })
    ).toHaveProperty('error');
    expect(authorize).toHaveBeenCalledWith('shared-ws', ['manage_drive']);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('denies workspace operations when authorizeWorkspaceTools is absent', async () => {
    const ctx = {
      wsId: 'shared-ws',
      userId: 'user-1',
      supabase: {},
    } as unknown as MiraToolContext;
    const tools = createMiraStreamTools(ctx, () => false);

    expect(
      await invoke(tools, 'delete_time_tracking_category', {
        categoryId: 'cat-1',
      })
    ).toHaveProperty('error');
    expect(dispatch).not.toHaveBeenCalled();
  });
});

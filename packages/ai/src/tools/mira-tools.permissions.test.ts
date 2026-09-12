import { beforeEach, describe, expect, it, vi } from 'vitest';
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

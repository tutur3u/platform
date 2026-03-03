import { describe, expect, it } from 'vitest';
import { createMiraStreamTools, type MiraToolContext } from './mira-tools';

const dummyCtx = {
  userId: 'user-1',
  wsId: 'ws-1',
  supabase: {} as MiraToolContext['supabase'],
  timezone: 'Asia/Saigon',
} satisfies MiraToolContext;

describe('mira-tools select_tools safeguards', () => {
  it('filters out repeatedly failing tools from select_tools results', async () => {
    const tools = createMiraStreamTools(dummyCtx, undefined, () => [
      {
        toolResults: [
          {
            toolName: 'create_task',
            output: { success: false, error: 'Create failed' },
          },
        ],
      },
      {
        toolResults: [
          {
            toolName: 'create_task',
            output: { success: true, message: 'No fields to update' },
          },
        ],
      },
      {
        toolResults: [
          {
            toolName: 'create_task',
            output: { ok: false, error: 'Still failing' },
          },
        ],
      },
    ]);

    const selectTools = tools.select_tools as unknown as {
      execute?: (
        args: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    if (typeof selectTools.execute !== 'function') {
      throw new Error('select_tools execute is not available');
    }

    const result = await selectTools.execute({
      tools: ['create_task', 'get_my_tasks'],
    });

    expect(result.selectedTools).toEqual(['get_my_tasks']);
    expect(result.skippedTools).toEqual(['create_task']);
  });
});

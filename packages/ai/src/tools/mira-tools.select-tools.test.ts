import { describe, expect, it } from 'vitest';
import { createMiraStreamTools, type MiraToolContext } from './mira-tools';

const dummyCtx = {
  userId: 'user-1',
  wsId: 'ws-1',
  supabase: {} as MiraToolContext['supabase'],
  timezone: 'Asia/Saigon',
} satisfies MiraToolContext;

const attachmentOnlyCtx = {
  ...dummyCtx,
  latestUserTurn: {
    hasAttachments: true,
    isAttachmentOnly: true,
    text: 'Please analyze the attached file(s).',
  },
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

  it('rejects re-opening tool selection after no_action_needed was already chosen', async () => {
    const tools = createMiraStreamTools(dummyCtx, undefined, () => [
      {
        toolResults: [
          {
            toolName: 'select_tools',
            output: { ok: true, selectedTools: ['no_action_needed'] },
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
      tools: ['remember'],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('no_action_needed');
  });

  it('filters persistence tools out of attachment-only turns', async () => {
    const tools = createMiraStreamTools(attachmentOnlyCtx);

    const selectTools = tools.select_tools as unknown as {
      execute?: (
        args: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    if (typeof selectTools.execute !== 'function') {
      throw new Error('select_tools execute is not available');
    }

    const result = await selectTools.execute({
      tools: [
        'remember',
        'delete_memory',
        'merge_memories',
        'update_my_settings',
      ],
    });

    expect(result.selectedTools).toEqual(['no_action_needed']);
    expect(result.skippedTools).toEqual([
      'remember',
      'delete_memory',
      'merge_memories',
      'update_my_settings',
    ]);
  });
});

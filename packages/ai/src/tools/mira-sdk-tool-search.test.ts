import { generateText, isStepCount, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createMiraSdkToolSearch } from './mira-sdk-tool-search';
import type { MiraToolContext } from './mira-tool-types';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const policy = { activeTools: ['search_tools', 'no_action_needed'] };
function fixture(allowed = true) {
  const execute = vi.fn(async () => ({ created: true }));
  const ctx = {
    userId: 'user',
    wsId: 'workspace',
    supabase: {},
    authorizeWorkspaceTools: vi.fn(async () => allowed),
  } as unknown as MiraToolContext;
  const runtime = createMiraSdkToolSearch(
    {
      search_tools: tool({ inputSchema: z.object({ query: z.string() }) }),
      no_action_needed: tool({ inputSchema: z.object({}) }),
      create_event: tool({
        description: 'Schedule a meeting and invite attendees',
        inputSchema: z.object({ title: z.string() }),
        execute,
      }),
      get_my_tasks: tool({
        description: 'Read tasks',
        inputSchema: z.object({}),
        execute: async () => [],
      }),
    },
    ctx
  );
  return { runtime, ctx, execute };
}

describe('native SDK deferred Mira discovery', () => {
  it('loads meeting definitions on the next step and executes only a discovered tool', async () => {
    const { runtime, execute } = fixture();
    const seen: string[][] = [];
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        seen.push(options.tools?.map((entry) => entry.name) ?? []);
        const index = seen.length;
        return {
          content:
            index === 1
              ? [
                  {
                    type: 'tool-call',
                    toolCallId: 'search',
                    toolName: 'search_tools',
                    input: JSON.stringify({ query: 'meeting' }),
                  },
                ]
              : index === 2
                ? [
                    {
                      type: 'tool-call',
                      toolCallId: 'create',
                      toolName: 'create_event',
                      input: JSON.stringify({ title: 'Team meeting' }),
                    },
                  ]
                : [{ type: 'text', text: 'Created' }],
          finishReason: {
            unified: index < 3 ? 'tool-calls' : 'stop',
            raw: undefined,
          },
          usage,
          warnings: [],
        };
      },
    });
    await generateText({
      model,
      tools: runtime.tools,
      prompt: 'Schedule a meeting',
      prepareStep: () => runtime.prepareStep(policy),
      stopWhen: isStepCount(4),
    });
    expect(seen[0]).toEqual(['search_tools', 'no_action_needed']);
    expect(seen[1]).toContain('create_event');
    expect(seen[1]).not.toContain('get_my_tasks');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('fails closed when no permission resolver is available', async () => {
    const { runtime, ctx } = fixture();
    ctx.authorizeWorkspaceTools = undefined;
    const step = await runtime.prepareStep(policy);
    expect(step.activeTools).not.toContain('create_event');
  });

  it('does not discover or execute unauthorized tools', async () => {
    const { runtime, execute } = fixture(false);
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => ({
        content: options.prompt.some((message) => message.role === 'tool')
          ? [{ type: 'text', text: 'Unavailable' }]
          : [
              {
                type: 'tool-call',
                toolCallId: 'search',
                toolName: 'search_tools',
                input: '{"query":"meeting"}',
              },
            ],
        finishReason: { unified: 'stop', raw: undefined },
        usage,
        warnings: [],
      }),
    });
    const result = await generateText({
      model,
      tools: runtime.tools,
      prompt: 'Find meeting tools',
      prepareStep: () => runtime.prepareStep(policy),
      stopWhen: isStepCount(3),
    });
    expect(result.steps[0]?.toolResults[0]?.output).toEqual({ tools: [] });
    expect(execute).not.toHaveBeenCalled();
  });

  it('respects explicit selection and terminal loop guards', async () => {
    const { runtime } = fixture();
    const selected = await runtime.prepareStep({
      activeTools: ['create_event'],
      toolChoice: 'required',
    });
    expect(selected.activeTools).toEqual(['create_event']);
    expect(runtime.tools.create_event?.deferLoading).toBe(false);
    expect(
      await runtime.prepareStep({
        activeTools: ['create_event'],
        toolChoice: 'none',
      })
    ).toMatchObject({ activeTools: [], toolChoice: 'none' });
  });

  it('rechecks permissions after switching workspace', async () => {
    const { runtime, ctx } = fixture();
    ctx.authorizeWorkspaceTools = async (wsId) => wsId === 'workspace';
    expect((await runtime.prepareStep(policy)).activeTools).toContain(
      'create_event'
    );
    ctx.wsId = 'restricted';
    expect((await runtime.prepareStep(policy)).activeTools).not.toContain(
      'create_event'
    );
  });

  it('fails closed when workspace changes during authorization or lookup fails', async () => {
    const { runtime, ctx } = fixture();
    ctx.authorizeWorkspaceTools = async () => {
      ctx.wsId = 'changed';
      return true;
    };
    expect(await runtime.prepareStep(policy)).toMatchObject({
      activeTools: [],
      toolChoice: 'none',
    });
    ctx.authorizeWorkspaceTools = async () => {
      throw new Error('Unavailable');
    };
    expect((await runtime.prepareStep(policy)).activeTools).not.toContain(
      'create_event'
    );
  });
  it('discovery never bypasses the user approval gate for creating a meeting', async () => {
    const { runtime, execute } = fixture();
    let step = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          step++ === 0
            ? {
                type: 'tool-call',
                toolCallId: 'search',
                toolName: 'search_tools',
                input: '{"query":"meeting"}',
              }
            : {
                type: 'tool-call',
                toolCallId: 'meeting',
                toolName: 'create_event',
                input: '{"title":"Review before sending"}',
              },
        ],
        finishReason: { unified: 'tool-calls', raw: undefined },
        usage,
        warnings: [],
      }),
    });
    const result = await generateText({
      model,
      tools: runtime.tools,
      prompt: 'Prepare a meeting',
      prepareStep: () => runtime.prepareStep(policy),
      toolApproval: { create_event: 'user-approval' },
      stopWhen: isStepCount(3),
    });
    expect(execute).not.toHaveBeenCalled();
    expect(
      result.response.messages.flatMap<unknown>((message) =>
        typeof message.content === 'string' ? [] : message.content
      )
    ).toContainEqual(
      expect.objectContaining({
        type: 'tool-approval-request',
        toolCallId: 'meeting',
      })
    );
  });
});

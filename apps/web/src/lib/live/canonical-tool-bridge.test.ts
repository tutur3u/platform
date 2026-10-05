import { jsonSchema, type ToolSet, tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { runCanonicalLiveTool } from './canonical-tool-bridge';

function registry() {
  const execute = vi.fn(async (input) => ({ saved: input }));
  const tools: ToolSet = {
    search_tools: tool({
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
      execute: async () => ({
        ok: true,
        selectedTools: ['save_memory', 'set_workspace_context', 'approval'],
        matches: [
          { name: 'save_memory' },
          { name: 'set_workspace_context' },
          { name: 'approval' },
          { name: 'missing' },
        ],
      }),
    }),
    save_memory: tool({
      description: 'Save a preference',
      inputSchema: z.object({
        text: z.string().trim().min(1),
        kind: z.string().default('preference'),
      }),
      execute,
    }),
    set_workspace_context: tool({ inputSchema: z.object({}), execute }),
    approval: tool({ inputSchema: z.object({}), needsApproval: true, execute }),
  };
  return { tools, execute };
}

describe('canonical Live bridge', () => {
  it('discovers registry schemas while excluding unsupported and approval-gated tools', async () => {
    const { tools } = registry();
    const result = await runCanonicalLiveTool(
      tools,
      'search_workspace_tools',
      { query: 'preferences' },
      'call-1'
    );
    expect(result).toMatchObject({
      selectedTools: ['save_memory'],
      matches: [
        {
          name: 'save_memory',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
          },
        },
      ],
    });
  });

  it('uses canonical validation including defaults and transformations before execution', async () => {
    const { tools, execute } = registry();
    const result = await runCanonicalLiveTool(
      tools,
      'execute_workspace_tool',
      { toolName: 'save_memory', argumentsJson: '{"text":"  warm voice  "}' },
      'provider-call-2'
    );
    expect(result).toEqual({
      saved: { text: 'warm voice', kind: 'preference' },
    });
    expect(execute).toHaveBeenCalledWith(
      { text: 'warm voice', kind: 'preference' },
      { toolCallId: 'provider-call-2', messages: [], context: undefined }
    );
  });

  it.each(['null', '[]', 'bad JSON', '{"text":""}'])(
    'rejects invalid input %s without executing',
    async (argumentsJson) => {
      const { tools, execute } = registry();
      expect(
        await runCanonicalLiveTool(
          tools,
          'execute_workspace_tool',
          { toolName: 'save_memory', argumentsJson },
          'call-3'
        )
      ).toHaveProperty('error');
      expect(execute).not.toHaveBeenCalled();
    }
  );

  it.each([
    'approval',
    'set_workspace_context',
    'constructor',
    '__proto__',
    'missing',
  ])('does not execute unavailable registry name %s', async (toolName) => {
    const { tools, execute } = registry();
    expect(
      await runCanonicalLiveTool(
        tools,
        'execute_workspace_tool',
        { toolName, argumentsJson: '{}' },
        'call-4'
      )
    ).toEqual({ error: 'live_tool_unavailable' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails closed for a schema without a runtime validator', async () => {
    const { tools, execute } = registry();
    tools.save_memory = {
      ...tools.save_memory!,
      inputSchema: jsonSchema({ type: 'object' }),
    } as NonNullable<typeof tools.save_memory>;
    expect(
      await runCanonicalLiveTool(
        tools,
        'execute_workspace_tool',
        { toolName: 'save_memory', argumentsJson: '{}' },
        'call-5'
      )
    ).toHaveProperty('error');
    expect(execute).not.toHaveBeenCalled();
  });
});

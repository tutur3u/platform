import { Type } from '@google/genai';
import { asSchema, type ToolExecutionOptions, type ToolSet } from 'ai';
import { z } from 'zod';

export const CANONICAL_LIVE_TOOL_PROTOCOL = 'canonical-v1' as const;
export const liveToolProtocolSchema = z.enum(['legacy', 'canonical-v1']);
export type LiveToolProtocol = z.infer<typeof liveToolProtocolSchema>;

export const CANONICAL_LIVE_TOOL_DECLARATIONS = [
  {
    name: 'search_workspace_tools',
    description:
      'Discover authorized Tuturuuu capabilities by intent. Returns canonical input schemas and guidance. Search before executing an unfamiliar operation. Discovery does not mutate data.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'App or operation to find' },
        limit: { type: Type.INTEGER, description: 'Maximum matches, 1 to 8' },
      },
      required: ['query'],
    },
  },
  {
    name: 'execute_workspace_tool',
    description:
      'Execute an authorized capability returned by search_workspace_tools. Encode its input as a JSON object string matching the returned schema. Check the result before claiming completion; a permission or approval error is not success.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        toolName: {
          type: Type.STRING,
          description: 'Exact discovered tool name',
        },
        argumentsJson: {
          type: Type.STRING,
          description: 'JSON object containing the canonical tool input',
        },
      },
      required: ['toolName', 'argumentsJson'],
    },
  },
];

const discoveryInput = z.object({
  query: z.string().trim().min(1).max(240),
  limit: z.number().int().min(1).max(8).optional(),
});
const executionInput = z.object({
  toolName: z.string().min(1).max(128),
  argumentsJson: z.string().max(64_000),
});
const unavailableTools = new Set([
  'select_tools',
  'no_action_needed',
  'set_workspace_context',
  'render_ui',
]);

type Executable = (
  input: unknown,
  options: ToolExecutionOptions<unknown>
) => unknown;

function eligible(tools: ToolSet, name: string) {
  if (!Object.hasOwn(tools, name) || unavailableTools.has(name)) return null;
  const definition = tools[name];
  // This transport has no approval UI. Future approval-gated registry entries
  // stay unavailable rather than silently bypassing the canonical policy.
  return definition?.execute && !definition.needsApproval ? definition : null;
}

export async function runCanonicalLiveTool(
  tools: ToolSet,
  functionName: string,
  args: unknown,
  toolCallId: string
) {
  if (functionName === 'search_workspace_tools') {
    const parsed = discoveryInput.safeParse(args);
    const search = eligible(tools, 'search_tools');
    if (!parsed.success || !search?.execute) {
      return { error: 'live_tool_invalid_discovery' };
    }
    const result = await (search.execute as Executable)(parsed.data, {
      toolCallId,
      messages: [],
      context: undefined,
    });
    if (!result || typeof result !== 'object' || !('matches' in result)) {
      return { error: 'live_tool_discovery_unavailable' };
    }
    const candidates = Array.isArray(result.matches) ? result.matches : [];
    const matches = [];
    for (const candidate of candidates) {
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        !('name' in candidate) ||
        typeof candidate.name !== 'string'
      )
        continue;
      const definition = eligible(tools, candidate.name);
      if (!definition) continue;
      matches.push({
        name: candidate.name,
        description: definition.description ?? '',
        inputSchema: await asSchema(definition.inputSchema).jsonSchema,
      });
    }
    return {
      ...result,
      selectedTools: matches.map(({ name }) => name),
      matches,
      next: 'Call execute_workspace_tool with a discovered toolName and matching argumentsJson. Search again when the operation changes.',
    };
  }
  if (functionName !== 'execute_workspace_tool') {
    return { error: 'live_tool_unknown_function' };
  }
  const parsed = executionInput.safeParse(args);
  if (!parsed.success) return { error: 'live_tool_invalid_input' };
  const definition = eligible(tools, parsed.data.toolName);
  if (!definition?.execute) return { error: 'live_tool_unavailable' };
  let input: unknown;
  try {
    input = JSON.parse(parsed.data.argumentsJson);
  } catch {
    return { error: 'live_tool_invalid_json' };
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'live_tool_invalid_input' };
  }
  const schema = asSchema(definition.inputSchema);
  if (!schema.validate) return { error: 'live_tool_unvalidated_schema' };
  const validation = await schema.validate(input);
  if (!validation.success) return { error: 'live_tool_invalid_input' };
  return (definition.execute as Executable)(validation.value, {
    toolCallId,
    messages: [],
    context: undefined,
  });
}

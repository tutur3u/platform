import type { ModelMessage } from 'ai';

type ToolStepLike = {
  toolCalls?: Array<{
    toolName: string;
    args?: Record<string, unknown>;
    input?: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    toolName?: string;
    output?: Record<string, unknown>;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRenderableRenderUiSpec(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.root !== 'string' || value.root.length === 0) return false;
  if (!isRecord(value.elements)) return false;

  const elementEntries = Object.entries(value.elements);
  if (elementEntries.length === 0) return false;
  if (!(value.root in value.elements)) return false;

  const rootElement = value.elements[value.root];
  if (!isRecord(rootElement)) return false;
  return typeof rootElement.type === 'string';
}

function extractRenderUiOutputCandidates(output: unknown): unknown[] {
  if (!isRecord(output)) return [];
  const candidates: unknown[] = [output];

  const wrapperKeys = [
    'spec',
    'output',
    'result',
    'data',
    'payload',
    'json_schema',
    'schema',
  ];

  for (const key of wrapperKeys) {
    if (key in output) candidates.push(output[key]);
  }

  const jsonValue = output.json;
  if (typeof jsonValue === 'string') {
    const parsed = safeParseJson(jsonValue);
    if (parsed !== null) candidates.push(parsed);
  }
  if (typeof jsonValue === 'object' && jsonValue !== null) {
    candidates.push(jsonValue);
  }

  return candidates;
}

function hasRenderableSpecInOutput(output: unknown): boolean {
  const queue = extractRenderUiOutputCandidates(output);
  const visited = new WeakSet<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === null || current === undefined) continue;

    if (typeof current === 'string') {
      const parsed = safeParseJson(current);
      if (parsed !== null) queue.push(parsed);
      continue;
    }

    if (!isRecord(current)) continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (isRenderableRenderUiSpec(current)) return true;

    queue.push(...extractRenderUiOutputCandidates(current));
  }

  return false;
}

function isRecoveredRenderUiOutput(output: unknown): boolean {
  const queue: unknown[] = [output];
  const visited = new WeakSet<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === null || current === undefined) continue;

    if (typeof current === 'string') {
      const parsed = safeParseJson(current);
      if (parsed !== null) queue.push(parsed);
      continue;
    }

    if (!isRecord(current)) continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (
      current.recoveredFromInvalidSpec === true ||
      current.autoRecoveredFromInvalidSpec === true ||
      current.forcedFromRecoveryLoop === true
    ) {
      return true;
    }

    queue.push(...extractRenderUiOutputCandidates(current));
  }

  return false;
}

/**
 * Detect whether the render_ui output was an auto-populated fallback injected
 * by the preprocessor (context-aware smart component or generic Callout).
 * These specs are valid renderable UI and should stop the retry loop.
 */
function isAutoPopulatedFallback(output: unknown): boolean {
  if (!isRecord(output)) return false;
  return output.autoPopulatedFallback === true;
}

function extractTextFromUserMessage(message: ModelMessage): string {
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';

  return message.content
    .filter(
      (
        part
      ): part is {
        type: 'text';
        text: string;
      } => part.type === 'text' && typeof part.text === 'string'
    )
    .map((part) => part.text)
    .join('\n');
}

const PRODUCTIVITY_WORKSPACE_SCOPE_CUE_REGEX =
  /\b(my tasks?|tasks?|calendar|events?|agenda|finance|spending|wallet|transactions?|workspace|workspace members?|members?|teammates?|team)\b/;

const WORKSPACE_MEMBER_CUE_REGEX =
  /\b(workspace|workspace members?|members?|teammates?|team)\b/;

const WORKSPACE_QUALIFIER_REGEX =
  /\b(?:in|from|inside|within|under)\s+["'`]?([a-z0-9][\w&./-]*(?:\s+[a-z0-9][\w&./-]*){0,4})["'`]?/i;

const DISALLOWED_WORKSPACE_QUALIFIERS = new Set([
  'progress',
  'done',
  'todo',
  'to do',
  'today',
  'tomorrow',
  'tonight',
  'yesterday',
  'this week',
  'next week',
  'upcoming',
  'overdue',
  'personal',
  'my',
]);

function normalizeWorkspaceQualifierCandidate(candidate: string): string {
  return candidate
    .trim()
    .replace(/[?.,!;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function hasExplicitWorkspaceQualifier(text: string): boolean {
  const match = text.match(WORKSPACE_QUALIFIER_REGEX);
  if (!match?.[1]) return false;

  const normalizedCandidate = normalizeWorkspaceQualifierCandidate(match[1]);
  if (!normalizedCandidate) return false;
  if (DISALLOWED_WORKSPACE_QUALIFIERS.has(normalizedCandidate)) return false;

  return true;
}

export function shouldForceRenderUiForLatestUserMessage(
  messages: ModelMessage[]
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== 'user') continue;
    const text = extractTextFromUserMessage(message).toLowerCase();
    if (!text) return false;

    // Explicit user insistence that render_ui tool must be used.
    if (
      /render_ui/.test(text) &&
      /(must|should|need|use|tool|not like this|instead)/.test(text)
    ) {
      return true;
    }

    return false;
  }

  return false;
}

export function shouldForceGoogleSearchForLatestUserMessage(
  messages: ModelMessage[]
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== 'user') continue;

    const text = extractTextFromUserMessage(message).toLowerCase();
    if (!text) return false;

    const hasExplicitWebLookupRequest =
      /\b(google search|search (?:the )?(?:web|internet|online)|web search|internet search|look ?up (?:on )?(?:the )?(?:web|internet|online)|find (?:online|on the web))\b/.test(
        text
      );

    const hasRealtimeExternalCue =
      /\b(latest|current|right now|up[- ]?to[- ]?date|news|weather|forecast|price|pricing|cost|stock|stocks|exchange rate|score|scores|standings)\b/.test(
        text
      );

    const hasWorkspaceAppCue =
      /\b(my tasks?|task|agenda|calendar|event|events|wallet|transaction|spending|finance|timer|time tracking|workspace|board|project|assignee)\b/.test(
        text
      );

    if (hasExplicitWebLookupRequest) return true;
    if (hasRealtimeExternalCue && !hasWorkspaceAppCue) return true;
    return false;
  }

  return false;
}

export function shouldPreferMarkdownTablesForLatestUserMessage(
  messages: ModelMessage[]
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== 'user') continue;

    const text = extractTextFromUserMessage(message).toLowerCase();
    if (!text) return false;

    const requestsTable =
      /\b(table|tabular|rows?|columns?|markdown table)\b/.test(text) ||
      /\|\s*[^|\n]+\s*\|/.test(text);

    if (!requestsTable) return false;

    const explicitlyVisualUi =
      /\b(render_ui|dashboard|card|chart|graph|widget|visual ui)\b/.test(text);

    return !explicitlyVisualUi;
  }

  return false;
}

export function shouldResolveWorkspaceContextForLatestUserMessage(
  messages: ModelMessage[]
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== 'user') continue;

    const text = extractTextFromUserMessage(message).toLowerCase();
    if (!text) return false;

    return (
      PRODUCTIVITY_WORKSPACE_SCOPE_CUE_REGEX.test(text) &&
      hasExplicitWorkspaceQualifier(text)
    );
  }

  return false;
}

export function shouldForceWorkspaceMembersForLatestUserMessage(
  messages: ModelMessage[]
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== 'user') continue;

    const text = extractTextFromUserMessage(message).toLowerCase();
    if (!text) return false;

    return (
      WORKSPACE_MEMBER_CUE_REGEX.test(text) &&
      /\b(who(?:'s| is)?|list|show|see|what)\b/.test(text)
    );
  }

  return false;
}

export function extractSelectedToolsFromSteps(steps: unknown[]): string[] {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i] as ToolStepLike | undefined;
    const selectCall = step?.toolCalls?.find(
      (toolCall) => toolCall.toolName === 'select_tools'
    );
    const tools = selectCall?.args?.tools ?? selectCall?.input?.tools;
    if (Array.isArray(tools)) {
      return tools.filter((tool): tool is string => typeof tool === 'string');
    }

    const selectResult = step?.toolResults?.find(
      (toolResult) => toolResult.toolName === 'select_tools'
    );
    const selectedTools = selectResult?.output?.selectedTools;
    if (Array.isArray(selectedTools)) {
      return selectedTools.filter(
        (tool): tool is string => typeof tool === 'string'
      );
    }
  }
  return [];
}

export function wasToolEverSelectedInSteps(
  steps: unknown[],
  toolName: string
): boolean {
  return steps.some((step) => {
    const typedStep = step as ToolStepLike | undefined;

    const fromCalls = (typedStep?.toolCalls ?? []).some((toolCall) => {
      if (toolCall.toolName !== 'select_tools') return false;
      const tools = toolCall.args?.tools ?? toolCall.input?.tools;
      return (
        Array.isArray(tools) &&
        tools.some((tool) => typeof tool === 'string' && tool === toolName)
      );
    });

    if (fromCalls) return true;

    return (typedStep?.toolResults ?? []).some((toolResult) => {
      if (toolResult.toolName !== 'select_tools') return false;
      const selected = toolResult.output?.selectedTools;
      return (
        Array.isArray(selected) &&
        selected.some((tool) => typeof tool === 'string' && tool === toolName)
      );
    });
  });
}

export function hasToolCallInSteps(
  steps: unknown[],
  toolName: string
): boolean {
  return steps.some((step) => {
    const typedStep = step as ToolStepLike | undefined;
    const called = (typedStep?.toolCalls ?? []).some(
      (toolCall) => toolCall.toolName === toolName
    );
    const hasResult = (typedStep?.toolResults ?? []).some(
      (toolResult) => toolResult.toolName === toolName
    );
    return called || hasResult;
  });
}

export function hasRenderableRenderUiInSteps(steps: unknown[]): boolean {
  return steps.some((step) => {
    const typedStep = step as ToolStepLike | undefined;
    return (typedStep?.toolResults ?? []).some((toolResult) => {
      if (toolResult.toolName !== 'render_ui') return false;
      if (!toolResult.output) return false;

      // Auto-populated fallbacks (from the preprocessor injecting context-aware
      // UI when the model sends empty elements) are valid renderable specs —
      // they should stop the retry loop.
      if (isAutoPopulatedFallback(toolResult.output)) return true;

      return (
        hasRenderableSpecInOutput(toolResult.output) &&
        !isRecoveredRenderUiOutput(toolResult.output)
      );
    });
  });
}

/** Count how many render_ui tool calls have been attempted across all steps. */
export function countRenderUiAttemptsInSteps(steps: unknown[]): number {
  let count = 0;
  for (const step of steps) {
    const typedStep = step as ToolStepLike | undefined;
    for (const toolCall of typedStep?.toolCalls ?? []) {
      if (toolCall.toolName === 'render_ui') count += 1;
    }
  }
  return count;
}

export function buildActiveToolsFromSelected(
  selectedTools: string[]
): string[] {
  if (selectedTools.length === 0) return ['select_tools', 'no_action_needed'];

  const unique = Array.from(new Set(selectedTools));
  const includesNoAction = unique.includes('no_action_needed');

  const active = [
    ...unique.filter(
      (toolName) =>
        toolName !== 'select_tools' && toolName !== 'no_action_needed'
    ),
    'select_tools',
    ...(includesNoAction ? ['no_action_needed'] : []),
  ];

  return Array.from(new Set(active));
}

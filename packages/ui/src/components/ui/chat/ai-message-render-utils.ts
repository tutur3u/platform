export type AiMessagePart = Record<string, unknown> & { type?: string };

export function normalizeAiMessageParts(
  parts?: AiMessagePart[],
  textFallback?: string
) {
  const fallbackText = textFallback?.trim();
  const normalizedParts = Array.isArray(parts) ? parts : [];
  const hasTextPart = normalizedParts.some(
    (part) => readString(part.type) === 'text' && readString(part.text)
  );

  if (normalizedParts.length > 0) {
    return fallbackText && !hasTextPart
      ? ([
          { text: fallbackText, type: 'text' },
          ...normalizedParts,
        ] satisfies AiMessagePart[])
      : normalizedParts;
  }

  return fallbackText
    ? [{ type: 'text', text: fallbackText } satisfies AiMessagePart]
    : [];
}

export function getPartKey(part: AiMessagePart, index: number) {
  return (
    readString(part.toolCallId) ??
    readString(part.sourceId) ??
    `${readString(part.type) ?? 'part'}-${index}`
  );
}

export function readToolNameFromType(part: AiMessagePart) {
  const type = readString(part.type);
  return type?.startsWith('tool-') ? type.slice(5) : null;
}

export function humanizeToolName(value: string) {
  return value
    .replace(/_/gu, ' ')
    .replace(/\b\w/gu, (char) => char.toUpperCase());
}

export function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function formatJson(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function resolveRenderUiSpecFromOutput(output: unknown): unknown | null {
  const queue = [output];
  const visited = new WeakSet<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (typeof current === 'string') {
      const parsed = safeParseJson(current);
      if (parsed) queue.push(parsed);
      continue;
    }
    if (!isRecord(current)) continue;
    if (visited.has(current)) continue;
    visited.add(current);
    if (typeof current.root === 'string' && isRecord(current.elements)) {
      return current;
    }
    for (const key of ['spec', 'output', 'result', 'data', 'payload', 'json']) {
      if (key in current) queue.push(current[key]);
    }
  }

  return null;
}

export function getAiMessagePartsFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): AiMessagePart[] | undefined {
  const rootMetadata = readRecord(metadata);
  const nestedMetadata = readRecord(rootMetadata?.metadata);
  const directAi = readRecord(rootMetadata?.ai);
  const nestedAi = readRecord(nestedMetadata?.ai);
  const parts = directAi?.parts ?? nestedAi?.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    return parts as AiMessagePart[];
  }

  return buildLegacyAiParts(directAi ?? nestedAi, rootMetadata, nestedMetadata);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function buildLegacyAiParts(
  aiMetadata: Record<string, unknown> | null,
  rootMetadata: Record<string, unknown> | null,
  nestedMetadata: Record<string, unknown> | null
) {
  const parts: AiMessagePart[] = [];
  const reasoning =
    readString(aiMetadata?.reasoning) ??
    readString(rootMetadata?.reasoning) ??
    readString(nestedMetadata?.reasoning);

  if (reasoning) {
    parts.push({ text: reasoning, type: 'reasoning' });
  }

  const toolCalls = readArray(
    rootMetadata?.toolCalls ?? nestedMetadata?.toolCalls
  );
  const toolResults = readArray(
    rootMetadata?.toolResults ?? nestedMetadata?.toolResults
  );
  const toolParts = mergeLegacyToolParts(toolCalls, toolResults);
  parts.push(...toolParts);

  const sources = readArray(rootMetadata?.sources ?? nestedMetadata?.sources);
  for (const source of sources) {
    const sourceRecord = readRecord(source);
    const url = readString(sourceRecord?.url);
    if (!url) continue;

    parts.push({
      sourceId: readString(sourceRecord?.sourceId) ?? url,
      title: readString(sourceRecord?.title) ?? undefined,
      type: 'source-url',
      url,
    });
  }

  return parts.length > 0 ? parts : undefined;
}

function mergeLegacyToolParts(toolCalls: unknown[], toolResults: unknown[]) {
  const resultByCallId = new Map<string, Record<string, unknown>>();
  const usedResultIds = new Set<string>();

  for (const result of toolResults) {
    const resultRecord = readRecord(result);
    const toolCallId = readString(resultRecord?.toolCallId);
    if (!resultRecord || !toolCallId) continue;
    resultByCallId.set(toolCallId, resultRecord);
  }

  const parts: AiMessagePart[] = [];
  for (const call of toolCalls) {
    const callRecord = readRecord(call);
    if (!callRecord) continue;

    const toolCallId = readString(callRecord.toolCallId);
    const result = toolCallId ? resultByCallId.get(toolCallId) : undefined;
    if (toolCallId && result) usedResultIds.add(toolCallId);

    parts.push({
      input: callRecord.input ?? callRecord.args ?? callRecord.arguments ?? {},
      output: result ? extractLegacyToolOutput(result) : undefined,
      state: result ? 'output-available' : 'input-available',
      toolCallId: toolCallId ?? undefined,
      toolName:
        readString(callRecord.toolName) ??
        readString(result?.toolName) ??
        'tool',
      type: 'dynamic-tool',
    });
  }

  for (const result of toolResults) {
    const resultRecord = readRecord(result);
    if (!resultRecord) continue;

    const toolCallId = readString(resultRecord.toolCallId);
    if (toolCallId && usedResultIds.has(toolCallId)) continue;

    parts.push({
      output: extractLegacyToolOutput(resultRecord),
      state: 'output-available',
      toolCallId: toolCallId ?? undefined,
      toolName: readString(resultRecord.toolName) ?? 'tool',
      type: 'dynamic-tool',
    });
  }

  return parts;
}

function extractLegacyToolOutput(result: Record<string, unknown>) {
  return result.output ?? result.result ?? result;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

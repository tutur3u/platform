import { randomUUID } from 'node:crypto';

type Part = Record<string, unknown>;
type Step = {
  content?: readonly unknown[];
  text?: string;
  reasoningText?: string;
  toolCalls?: readonly Part[];
  toolResults?: readonly Part[];
};

/** Keep provider content order; tool results update their original call slot. */
export function collectAssistantMessageParts(response: {
  steps?: readonly Step[];
  text?: string;
  reasoningText?: string;
  sources?: readonly { sourceId?: string; url?: string; title?: string }[];
}): Part[] {
  const parts: Part[] = [];
  const calls = new Map<string, Part>();
  const append = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const part = value as Part;
    if (part.type === 'text' || part.type === 'reasoning') {
      if (typeof part.text === 'string' && part.text.length)
        parts.push({ ...part });
    } else if (
      part.type === 'tool-call' ||
      part.type === 'tool-result' ||
      part.type === 'tool-error'
    ) {
      const id =
        typeof part.toolCallId === 'string' ? part.toolCallId : randomUUID();
      let call = calls.get(id);
      if (!call) {
        call = {
          type: 'dynamic-tool',
          toolName: part.toolName ?? 'tool',
          toolCallId: id,
          state: 'input-available',
        };
        calls.set(id, call);
        parts.push(call);
      }
      if (part.type === 'tool-call') {
        call.input = part.input ?? part.args ?? part.arguments ?? {};
      } else if (part.type === 'tool-error') {
        call.state = 'output-error';
        call.errorText =
          typeof part.error === 'string' ? part.error : 'Tool execution failed';
      } else {
        call.state = 'output-available';
        call.output = part.output ?? part.result ?? null;
      }
    } else if (part.type === 'source' && part.sourceType === 'url') {
      parts.push({ ...part, type: 'source-url' });
    } else if (part.type === 'file') {
      const file = part.file as
        | { mediaType?: string; base64?: string }
        | undefined;
      if (file?.mediaType && file.base64)
        parts.push({
          type: 'file',
          mediaType: file.mediaType,
          url: `data:${file.mediaType};base64,${file.base64}`,
        });
    }
  };
  for (const step of response.steps ?? []) {
    parts.push({ type: 'step-start' });
    if (step.content?.length) {
      step.content.forEach(append);
    } else {
      // Legacy callers have only per-step aggregates; never flatten across steps.
      if (step.reasoningText)
        append({ type: 'reasoning', text: step.reasoningText });
      if (step.text) append({ type: 'text', text: step.text });
      for (const part of step.toolCalls ?? [])
        append({ ...part, type: 'tool-call' });
    }
    for (const part of step.toolResults ?? [])
      append({ ...part, type: 'tool-result' });
  }
  if (!parts.some((part) => part.type === 'text') && response.text)
    append({ type: 'text', text: response.text });
  if (
    !parts.some((part) => part.type === 'reasoning') &&
    response.reasoningText
  )
    append({ type: 'reasoning', text: response.reasoningText });
  for (const source of response.sources ?? []) {
    if (
      source.url &&
      !parts.some(
        (part) => part.type === 'source-url' && part.url === source.url
      )
    )
      parts.push({
        ...source,
        type: 'source-url',
        sourceId: source.sourceId ?? source.url,
      });
  }
  return parts;
}

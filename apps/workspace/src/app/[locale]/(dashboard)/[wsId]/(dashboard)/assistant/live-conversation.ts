import type { UIMessage } from '@tuturuuu/ai/types';

export type LiveConversationMessage = UIMessage & { complete: boolean };
export type LiveConversationEvent =
  | { type: 'notice'; status: 'started' | 'ended'; text: string }
  | { type: 'text'; role: 'user' | 'assistant'; text: string }
  | { type: 'tool'; id: string; name: string; input: unknown }
  | { type: 'result'; id: string; output: unknown }
  | { type: 'source'; url: string; title?: string }
  | { type: 'finish'; interrupted?: boolean; errorText?: string };

/** Preserve event order; results update their original call rather than appending. */
export function reduceLiveConversation(
  messages: LiveConversationMessage[],
  event: LiveConversationEvent,
  id: string
): LiveConversationMessage[] {
  if (event.type === 'notice')
    return [
      ...messages.map((message) => ({ ...message, complete: true })),
      {
        id,
        role: 'assistant',
        complete: true,
        parts: [
          {
            type: 'data-live-session',
            data: { status: event.status, text: event.text },
          },
        ],
      },
    ];
  if (event.type === 'finish') {
    return messages.map((message) => ({
      ...message,
      complete: true,
      parts: message.parts.map((part) =>
        event.interrupted &&
        part.type === 'dynamic-tool' &&
        part.state === 'input-available'
          ? {
              ...part,
              state: 'output-error' as const,
              errorText: event.errorText ?? '',
            }
          : part
      ),
    }));
  }
  if (event.type === 'result') {
    const output =
      event.output && typeof event.output === 'object'
        ? (event.output as Record<string, unknown>)
        : null;
    const failed =
      !!output &&
      (output.error != null ||
        output.success === false ||
        output.cancelled === true);
    return messages.map((message) => ({
      ...message,
      parts: message.parts.map((part): UIMessage['parts'][number] => {
        if (part.type !== 'dynamic-tool' || part.toolCallId !== event.id)
          return part;
        const call = {
          type: 'dynamic-tool' as const,
          toolName: part.toolName,
          toolCallId: part.toolCallId,
          input: part.input,
        };
        return failed
          ? {
              ...call,
              state: 'output-error',
              errorText:
                typeof output?.error === 'string'
                  ? output.error
                  : typeof output?.message === 'string'
                    ? output.message
                    : JSON.stringify(output),
            }
          : { ...call, state: 'output-available', output: event.output };
      }),
    }));
  }
  const role = event.type === 'text' ? event.role : 'assistant';
  const last = messages.at(-1);
  const continuing =
    last?.role === role && (!last.complete || event.type === 'source');
  const message: LiveConversationMessage = continuing
    ? { ...last, parts: [...last.parts] }
    : { id, role, parts: [], complete: false };
  if (event.type === 'source') {
    if (
      !message.parts.some(
        (part) => part.type === 'source-url' && part.url === event.url
      )
    )
      message.parts.push({
        type: 'source-url',
        sourceId: event.url,
        url: event.url,
        title: event.title,
      });
  } else if (event.type === 'tool') {
    if (
      messages.some((item) =>
        item.parts.some(
          (part) => part.type === 'dynamic-tool' && part.toolCallId === event.id
        )
      )
    )
      return messages;
    message.parts.push({
      type: 'dynamic-tool',
      toolName: event.name,
      toolCallId: event.id,
      input: event.input,
      state: 'input-available',
    });
  } else {
    if (!event.text) return messages;
    const part = message.parts.at(-1);
    if (part?.type === 'text')
      message.parts[message.parts.length - 1] = {
        ...part,
        text: part.text + event.text,
      };
    else message.parts.push({ type: 'text', text: event.text });
  }
  return continuing
    ? [...messages.slice(0, -1), message]
    : [...messages.map((item) => ({ ...item, complete: true })), message];
}

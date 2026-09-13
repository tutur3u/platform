import type { UIMessage } from '@tuturuuu/ai/types';
import { getMiraToolName } from '../components/mira-tool-part-utils';

/** Bound the initial voice context without discarding the saved conversation. */
export function buildLiveConversationContext(
  messages: UIMessage[],
  maxCharacters = 64000
) {
  const turns: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  let remaining = maxCharacters;
  for (const message of [...messages].reverse()) {
    if (remaining <= 0) break;
    const text = message.parts
      .map((part) => {
        if (part.type === 'text') return part.text;
        if (part.type === 'source-url')
          return `${part.title ?? ''}: ${part.url}`;
        const name = getMiraToolName(part);
        if (name) {
          const value =
            'errorText' in part &&
            typeof part.errorText === 'string' &&
            part.errorText.trim()
              ? { state: 'output-error', error: part.errorText }
              : 'output' in part
                ? part.output
                : 'input' in part
                  ? part.input
                  : null;
          return `[${name}: ${JSON.stringify(value)?.slice(0, 4000)}]`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .slice(-remaining);
    if (!text) continue;
    remaining -= text.length;
    turns.unshift({
      role: message.role === 'user' ? 'user' : 'model',
      parts: [{ text }],
    });
  }
  return turns;
}

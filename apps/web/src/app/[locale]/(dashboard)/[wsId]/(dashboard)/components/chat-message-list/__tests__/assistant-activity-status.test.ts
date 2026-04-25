import type { UIMessage } from '@tuturuuu/ai/types';
import { describe, expect, it } from 'vitest';
import { getAssistantActivityStatus } from '../../chat-message-list';

function message(
  role: UIMessage['role'],
  parts: UIMessage['parts']
): UIMessage {
  return {
    id: crypto.randomUUID(),
    role,
    parts,
  } as UIMessage;
}

describe('getAssistantActivityStatus', () => {
  it('shows an immediate drafting status while the submitted prompt is still the latest message', () => {
    expect(
      getAssistantActivityStatus({
        isStreaming: true,
        lastMessage: message('user', [{ type: 'text', text: 'Hello' }]),
      })
    ).toBe('drafting');
  });

  it('switches to a tool status when assistant tool work appears before text', () => {
    expect(
      getAssistantActivityStatus({
        isStreaming: true,
        lastMessage: message('assistant', [
          {
            type: 'tool-google_search',
            toolCallId: 'search-1',
            state: 'input-available',
            input: { query: 'current AI SDK docs' },
          } as never,
        ]),
      })
    ).toBe('tools');
  });

  it('hides the activity status as soon as assistant text is streaming', () => {
    expect(
      getAssistantActivityStatus({
        isStreaming: true,
        lastMessage: message('assistant', [
          { type: 'text', text: 'I’ll check that now.' },
        ]),
      })
    ).toBeNull();
  });
});

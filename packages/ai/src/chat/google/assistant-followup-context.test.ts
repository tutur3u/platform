import { describe, expect, it } from 'vitest';
import { prepareProcessedMessages } from './route-message-preparation';

describe('completed assistant history in follow-up requests', () => {
  it.each(['a', '𠮷'])(
    'keeps the complete %s answer through real model-message preparation',
    async (character) => {
      const reply = `${character.repeat(10_000)}Final answer`;
      const prepared = await prepareProcessedMessages(
        [
          {
            id: 'assistant',
            role: 'assistant',
            parts: [{ type: 'text', text: reply }],
          },
          {
            id: 'follow-up',
            role: 'user',
            parts: [{ type: 'text', text: 'Explain the ending' }],
          },
        ],
        undefined,
        'conversation'
      );
      if ('error' in prepared) throw new Error(await prepared.error.text());
      const assistant = prepared.processedMessages.find(
        (message) => message.role === 'assistant'
      );
      expect(assistant).toBeDefined();
      if (!assistant || typeof assistant.content === 'string')
        throw new Error('Expected structured answer');
      const textParts = assistant.content.filter(
        (part) => part.type === 'text'
      );
      expect(textParts.map((part) => part.text).join('')).toBe(reply);
      expect(textParts.every((part) => part.text.length <= 10_000)).toBe(true);
      expect(
        textParts.every((part) => !/[\uD800-\uDBFF]$/u.test(part.text))
      ).toBe(true);
    }
  );

  it('still rejects an oversized user prompt', async () => {
    const prepared = await prepareProcessedMessages(
      [
        {
          id: 'user',
          role: 'user',
          parts: [{ type: 'text', text: 'a'.repeat(10_001) }],
        },
      ],
      undefined,
      'conversation'
    );
    expect('error' in prepared).toBe(true);
    if ('error' in prepared) expect(prepared.error.status).toBe(400);
  });
});

import { describe, expect, it } from 'vitest';
import { ChatRequestBodySchema } from './chat-request-schema';

describe('ChatRequestBodySchema', () => {
  it('accepts credit workspace aliases before route normalization', () => {
    const parsed = ChatRequestBodySchema.safeParse({
      messages: [],
      creditSource: 'personal',
      creditWsId: 'personal',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.creditWsId).toBe('personal');
    }
  });

  it('trims credit workspace identifiers', () => {
    const parsed = ChatRequestBodySchema.safeParse({
      messages: [],
      creditWsId: ' 00000000-0000-0000-0000-000000000000 ',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.creditWsId).toBe(
        '00000000-0000-0000-0000-000000000000'
      );
    }
  });
});

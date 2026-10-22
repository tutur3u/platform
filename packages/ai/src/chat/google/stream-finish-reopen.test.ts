import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  deductAiCredits: vi.fn(),
}));

import { restoreAssistantMessageContent } from '../assistant-message-content';
import { persistAssistantResponse } from './stream-finish-persistence';

describe('completed assistant reply database boundary', () => {
  it.each([
    { character: 'A', compact: false },
    { character: '𠮷', compact: false },
    { character: 'A', compact: true },
  ])(
    'saves and reopens a long $character reply (compact=$compact)',
    async ({ character, compact }) => {
      const reply = `${character.repeat(10_000)}The final answer must survive reload.`;
      const rows: Record<string, unknown>[] = [];
      const insert = vi.fn((payload: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            if (compact && insert.mock.calls.length === 1) {
              return {
                data: null,
                error: {
                  code: '22001',
                  message:
                    'PAYLOAD_FIELD_BYTES_EXCEEDED: ai_chat_messages.metadata exceeds 16384 bytes',
                },
              };
            }
            const content = String(payload.content);
            // public.ai_chat_messages constraints from 20260601210819.
            if (
              Array.from(content).length > 10_000 ||
              Buffer.byteLength(content) > 40_000
            ) {
              return {
                data: null,
                error: {
                  code: '23514',
                  message: 'ai_chat_messages_content_length_check',
                },
              };
            }
            rows.push(structuredClone(payload));
            return { data: { id: 'saved-assistant' }, error: null };
          },
        }),
      }));
      await expect(
        persistAssistantResponse({
          chatId: 'conversation',
          persistenceRequestId: 'original-request',
          userId: 'actor',
          model: 'subscription/model',
          effectiveSource: 'Mira',
          skipCreditDeduction: true,
          sbAdmin: { from: () => ({ insert }) },
          response: { finishReason: 'stop', text: reply },
        })
      ).resolves.toBe(true);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        chat_id: 'conversation',
        role: 'ASSISTANT',
        metadata: {
          requestId: 'original-request',
          ai: { parts: [{ type: 'text', text: reply }] },
        },
      });
      expect(
        restoreAssistantMessageContent(
          String(rows[0]?.content),
          rows[0]?.metadata
        )
      ).toBe(reply);
      expect(
        restoreAssistantMessageContent(String(rows[0]?.content), {
          source: 'ai-chat',
          metadata: rows[0]?.metadata,
        })
      ).toBe(reply);
    }
  );

  it('keeps legacy content and ignores unrelated or malformed overflow metadata', () => {
    for (const metadata of [
      null,
      { ai: { parts: [{ type: 'text', text: 'Other' }] } },
      { ai: { contentTruncated: true, parts: [{ type: 'text', text: 7 }] } },
    ]) {
      expect(restoreAssistantMessageContent('Original', metadata)).toBe(
        'Original'
      );
    }
  });
});

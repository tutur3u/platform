import { describe, expect, it, vi } from 'vitest';

const { ensureChatFileDigestMock } = vi.hoisted(() => ({
  ensureChatFileDigestMock: vi.fn(),
}));

vi.mock('../file-digests/ensure', () => ({
  ensureChatFileDigest: ensureChatFileDigestMock,
}));

import {
  injectFileDigestContextIntoMessages,
  injectFileDigestContextIntoUiMessages,
  processMessagesWithFiles,
} from './message-file-processing';

describe('injectFileDigestContextIntoMessages', () => {
  it('appends digest text blocks to the latest user message', async () => {
    const processedMessages = await injectFileDigestContextIntoMessages({
      digestBlocks: [
        'Attachment analysis context (system-generated reference):\n- The following summaries describe uploaded file contents for grounding only.',
        'Current-turn attachment digest: meeting.wav (audio/wav)\n\n### meeting.wav\nSummary',
      ],
      messages: [
        {
          content: 'Summarize this recording.',
          role: 'user',
        },
      ],
    });

    expect(processedMessages).toHaveLength(1);
    expect(processedMessages[0]).toEqual(
      expect.objectContaining({
        content: [
          expect.objectContaining({
            text: 'Summarize this recording.',
            type: 'text',
          }),
          expect.objectContaining({
            text: expect.stringContaining(
              'Attachment analysis context (system-generated reference)'
            ),
            type: 'text',
          }),
          expect.objectContaining({
            text: expect.stringContaining(
              'Current-turn attachment digest: meeting.wav'
            ),
            type: 'text',
          }),
        ],
      })
    );
  });

  it('preserves non-text model content parts when adding digest text', async () => {
    const processedMessages = await injectFileDigestContextIntoMessages({
      digestBlocks: ['Current-turn attachment digest: image.png (image/png)'],
      messages: [
        {
          content: [
            {
              image: new URL('https://example.com/image.png'),
              type: 'image',
            },
          ],
          role: 'user',
        },
      ] as never,
    });

    expect(processedMessages[0]).toEqual(
      expect.objectContaining({
        content: [
          expect.objectContaining({ type: 'image' }),
          expect.objectContaining({
            text: expect.stringContaining(
              'Current-turn attachment digest: image.png'
            ),
            type: 'text',
          }),
        ],
      })
    );
  });
});

describe('processMessagesWithFiles', () => {
  it('injects digest markdown instead of raw file parts', async () => {
    ensureChatFileDigestMock.mockResolvedValueOnce({
      cached: false,
      digest: {
        answerContextMarkdown: 'The audio says the budget was approved.',
        digestVersion: 1,
        displayName: 'budget-review.wav',
        extractedMarkdown: null,
        fileName: 'budget-review.wav',
        keyFacts: ['Budget approved'],
        limitations: [],
        mediaType: 'audio/wav',
        processorModel: 'google/gemini-3.1-flash-lite-preview',
        status: 'ready',
        storagePath: 'workspace-1/chats/ai/resources/chat-1/budget-review.wav',
        suggestedAlias: 'Budget Review',
        summary: 'Short budget approval recording.',
        title: 'Budget Review',
      },
      ok: true,
    });

    const processedMessages = await processMessagesWithFiles({
      chatFiles: [
        {
          name: 'budget-review.wav',
          storagePath:
            'workspace-1/chats/ai/resources/chat-1/budget-review.wav',
          type: 'audio/wav',
        },
      ],
      chatId: 'chat-1',
      creditWsId: 'workspace-1',
      messageId: 'message-1',
      messages: [
        {
          content: 'What does this audio say?',
          role: 'user',
        },
      ],
      userId: 'user-1',
      wsId: 'workspace-1',
    });

    expect(ensureChatFileDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat-1',
        messageId: 'message-1',
        userId: 'user-1',
        wsId: 'workspace-1',
      })
    );
    expect(processedMessages[0]).toEqual(
      expect.objectContaining({
        content: [
          expect.objectContaining({
            text: 'What does this audio say?',
            type: 'text',
          }),
          expect.objectContaining({
            text: expect.stringContaining(
              'Attachment analysis context (system-generated reference)'
            ),
            type: 'text',
          }),
          expect.objectContaining({
            text: expect.stringContaining(
              'The audio says the budget was approved.'
            ),
            type: 'text',
          }),
        ],
        role: 'user',
      })
    );
    expect(
      Array.isArray(processedMessages[0]?.content) &&
        processedMessages[0]?.content.some((part) => part.type === 'file')
    ).toBe(false);
  });
});

describe('injectFileDigestContextIntoUiMessages', () => {
  it('attaches digest blocks to the message that actually owns the attachment turn', async () => {
    const processedMessages = await injectFileDigestContextIntoUiMessages({
      digestBlocks: ['Current-turn attachment digest: hello.wav (audio/wav)'],
      messages: [
        {
          id: 'user-with-attachment',
          role: 'user',
          parts: [],
        },
        {
          id: 'later-user-message',
          role: 'user',
          parts: [{ type: 'text', text: 'hello?' }],
        },
      ] as never,
      targetMessageId: 'user-with-attachment',
    });

    expect(processedMessages[0]).toEqual(
      expect.objectContaining({
        id: 'user-with-attachment',
        parts: [
          expect.objectContaining({
            text: expect.stringContaining(
              'Current-turn attachment digest: hello.wav'
            ),
            type: 'text',
          }),
        ],
      })
    );
    expect(processedMessages[1]).toEqual(
      expect.objectContaining({
        id: 'later-user-message',
        parts: [expect.objectContaining({ text: 'hello?', type: 'text' })],
      })
    );
  });
});

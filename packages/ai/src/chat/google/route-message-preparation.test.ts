import type { ModelMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import {
  attachYoutubeVideoInputToLatestUserMessage,
  normalizeYoutubeVideoUrlForGemini,
  persistLatestUserMessage,
} from './route-message-preparation';

describe('route message preparation YouTube video inputs', () => {
  it('normalizes YouTube URLs to a single video without playlist parameters', () => {
    expect(
      normalizeYoutubeVideoUrlForGemini(
        'https://youtu.be/dQw4w9WgXcQ?list=RDdQw4w9WgXcQ'
      )
    ).toBe('https://youtu.be/dQw4w9WgXcQ');

    expect(
      normalizeYoutubeVideoUrlForGemini(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ'
      )
    ).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('attaches one YouTube URL as a Google-compatible video file part', () => {
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: 'Summarize https://youtu.be/dQw4w9WgXcQ?list=RDdQw4w9WgXcQ',
      },
    ];

    const result = attachYoutubeVideoInputToLatestUserMessage(messages, true);
    const latest = result[0]!;

    expect(Array.isArray(latest.content)).toBe(true);
    expect(latest.content).toEqual([
      {
        type: 'text',
        text: 'Summarize https://youtu.be/dQw4w9WgXcQ?list=RDdQw4w9WgXcQ',
      },
      {
        type: 'file',
        data: 'https://youtu.be/dQw4w9WgXcQ',
        mediaType: 'video/mp4',
      },
    ]);
  });

  it('does not attach YouTube file inputs when disabled', () => {
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: 'Summarize https://youtu.be/dQw4w9WgXcQ',
      },
    ];

    expect(attachYoutubeVideoInputToLatestUserMessage(messages, false)).toBe(
      messages
    );
  });

  it('does not persist the synthetic YouTube video file marker', async () => {
    const insertChatMessage = vi.fn().mockResolvedValue({ error: null });
    await persistLatestUserMessage({
      processedMessages: [
        { role: 'system', content: 'System prompt' },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Summarize https://youtu.be/dQw4w9WgXcQ',
            },
            {
              type: 'file',
              data: 'https://youtu.be/dQw4w9WgXcQ',
              mediaType: 'video/mp4',
            },
          ],
        },
      ],
      chatId: 'chat_1',
      insertChatMessage,
      source: 'Mira',
    });

    expect(insertChatMessage).toHaveBeenCalledWith({
      chat_id: 'chat_1',
      message: 'Summarize https://youtu.be/dQw4w9WgXcQ',
      source: 'Mira',
    });
  });
});

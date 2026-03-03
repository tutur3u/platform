import { describe, expect, it } from 'vitest';
import { normalizeInitialUserMessageContent } from './route';

describe('normalizeInitialUserMessageContent', () => {
  it('strips the synthetic placeholder for attachment-only first turns', () => {
    expect(
      normalizeInitialUserMessageContent(
        'Please analyze the attached file(s).',
        {
          attachments: [
            {
              name: 'audio.wav',
              size: 12,
              storagePath: 'ws/chat/audio.wav',
              type: 'audio/wav',
            },
          ],
        }
      )
    ).toBe('');
  });

  it('keeps real user text when attachments are present', () => {
    expect(
      normalizeInitialUserMessageContent('Summarize this recording', {
        attachments: [
          {
            name: 'audio.wav',
            size: 12,
            storagePath: 'ws/chat/audio.wav',
            type: 'audio/wav',
          },
        ],
      })
    ).toBe('Summarize this recording');
  });
});

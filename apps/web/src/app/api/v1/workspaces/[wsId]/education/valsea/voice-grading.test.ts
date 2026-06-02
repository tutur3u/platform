import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { gradeVoicePronunciation } from './voice-grading';

describe('gradeVoicePronunciation', () => {
  it('falls back to linear character comparison when token alignment exceeds the cell budget', async () => {
    const referenceText = `${'a'.repeat(260)}x`;
    const heardText = `z${referenceText}`;

    const result = await gradeVoicePronunciation({
      assessorModel: 'local-whisper-large-v3-turbo',
      file: new File(['audio'], 'sample.wav', { type: 'audio/wav' }),
      language: 'english',
      referenceText,
      transcription: { text: heardText },
    });

    expect(result.status).toBe('graded');
    expect(result.words).toHaveLength(1);
    expect(result.words[0]?.characters).toHaveLength(referenceText.length);
    expect(result.words[0]?.characters[0]).toMatchObject({
      character: 'a',
      heard: 'z',
      status: 'substituted',
    });
  });
});

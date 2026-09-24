import { describe, expect, it } from 'vitest';
import { pickRecorderMimeType, RECORDER_MIME_TYPES } from './recording';

describe('recorder mime type selection', () => {
  it('prefers opus in webm, which the transcription pipeline handles best', () => {
    expect(pickRecorderMimeType(() => true)).toBe('audio/webm;codecs=opus');
  });

  it('falls back to mp4 when webm is unavailable, as on Safari', () => {
    expect(pickRecorderMimeType((type) => type.startsWith('audio/mp4'))).toBe(
      'audio/mp4;codecs=mp4a.40.2'
    );
  });

  it('returns undefined when nothing matches so MediaRecorder picks its own', () => {
    expect(pickRecorderMimeType(() => false)).toBeUndefined();
  });

  it('only offers audio containers', () => {
    for (const type of RECORDER_MIME_TYPES) {
      expect(type.startsWith('audio/')).toBe(true);
    }
  });
});

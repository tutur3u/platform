import { describe, expect, it, vi } from 'vitest';
import {
  MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES,
  TranscriptionAudioInputError,
  transcribeWorkspaceMeetingAudio,
  validateTranscriptionAudioInput,
} from './meetings';

function audioMetadata(size: number, type = 'audio/webm') {
  return { size, type };
}

function successfulJsonResponse() {
  return new Response(JSON.stringify({ text: 'transcript' }), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}

describe('meeting transcription audio validation', () => {
  it.each([
    MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES - 1,
    MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES,
  ])('accepts an allowed file at %i bytes', (size) => {
    expect(validateTranscriptionAudioInput(audioMetadata(size))).toBe(
      'audio/webm'
    );
  });

  it('rejects a file one byte above the inline limit', () => {
    expect(() =>
      validateTranscriptionAudioInput(
        audioMetadata(MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES + 1)
      )
    ).toThrow(
      expect.objectContaining({
        code: 'TRANSCRIPTION_AUDIO_TOO_LARGE',
        status: 413,
      })
    );
  });

  it('rejects empty audio', () => {
    expect(() => validateTranscriptionAudioInput(audioMetadata(0))).toThrow(
      expect.objectContaining({
        code: 'EMPTY_TRANSCRIPTION_AUDIO',
        status: 400,
      })
    );
  });

  it.each([
    ['audio/webm', 'audio/webm'],
    ['audio/webm;codecs=opus', 'audio/webm'],
    ['audio/mp4', 'audio/mp4'],
    ['audio/mp4; codecs=mp4a.40.2', 'audio/mp4'],
    ['audio/ogg', 'audio/ogg'],
    ['audio/ogg;codecs=opus', 'audio/ogg'],
    ['audio/mpeg', 'audio/mpeg'],
    ['audio/mpeg; codecs=mp3', 'audio/mpeg'],
  ] as const)('normalizes %s to %s', (type, expected) => {
    expect(validateTranscriptionAudioInput(audioMetadata(1, type))).toBe(
      expected
    );
  });

  it.each(['', 'audio/wav', 'video/webm', 'application/octet-stream'])(
    'rejects unsupported media type %s',
    (type) => {
      expect(() =>
        validateTranscriptionAudioInput(audioMetadata(1, type))
      ).toThrow(
        expect.objectContaining({
          code: 'UNSUPPORTED_TRANSCRIPTION_AUDIO_TYPE',
          status: 415,
        })
      );
    }
  );
});

describe('meeting transcription client', () => {
  it.each([
    ['empty', audioMetadata(0), 'EMPTY_TRANSCRIPTION_AUDIO', 400],
    [
      'oversized',
      audioMetadata(MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES + 1),
      'TRANSCRIPTION_AUDIO_TOO_LARGE',
      413,
    ],
    [
      'unsupported',
      audioMetadata(1, 'audio/wav'),
      'UNSUPPORTED_TRANSCRIPTION_AUDIO_TYPE',
      415,
    ],
  ] as const)(
    'rejects %s audio before network work',
    async (_label, audio, code, status) => {
      const fetchMock = vi.fn();

      await expect(
        transcribeWorkspaceMeetingAudio(audio as Blob, {
          baseUrl: 'https://internal.example.com',
          fetch: fetchMock as unknown as typeof fetch,
        })
      ).rejects.toEqual(
        expect.objectContaining({
          code,
          name: TranscriptionAudioInputError.name,
          status,
        })
      );
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['audio/webm', 'webm'],
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/mp4', 'mp4'],
    ['audio/mp4;codecs=mp4a.40.2', 'mp4'],
    ['audio/ogg', 'ogg'],
    ['audio/ogg;codecs=opus', 'ogg'],
    ['audio/mpeg', 'mp3'],
    ['audio/mpeg;codecs=mp3', 'mp3'],
  ] as const)(
    'preserves %s and uses a matching .%s filename',
    async (type, extension) => {
      const fetchMock = vi.fn().mockResolvedValue(successfulJsonResponse());
      const audio = new Blob(['audio'], { type });

      await transcribeWorkspaceMeetingAudio(audio, {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'https://internal.example.com/api/ai/meetings/transcription'
      );
      expect(init).toEqual(
        expect.objectContaining({
          body: expect.any(FormData),
          cache: 'no-store',
          method: 'POST',
        })
      );
      const uploadedAudio = (init.body as FormData).get('audio');
      expect(uploadedAudio).toBeInstanceOf(File);
      expect(uploadedAudio).toEqual(
        expect.objectContaining({
          name: `recording.${extension}`,
          type,
        })
      );
    }
  );
});

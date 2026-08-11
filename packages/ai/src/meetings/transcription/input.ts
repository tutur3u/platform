export const MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES = 18 * 1024 * 1024;
export const TRANSCRIPTION_MULTIPART_HEADROOM_BYTES = 1024 * 1024;
export const MAX_TRANSCRIPTION_MULTIPART_REQUEST_BYTES =
  MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES + TRANSCRIPTION_MULTIPART_HEADROOM_BYTES;

const TRANSCRIPTION_AUDIO_MEDIA_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/mpeg',
] as const;

export type TranscriptionAudioMediaType =
  (typeof TRANSCRIPTION_AUDIO_MEDIA_TYPES)[number];

type TranscriptionAudioValidation =
  | { mediaType: TranscriptionAudioMediaType; ok: true }
  | { message: string; ok: false; status: 400 | 413 | 415 };

export function validateTranscriptionAudioFile(
  audio: Pick<File, 'size' | 'type'>
): TranscriptionAudioValidation {
  if (audio.size <= 0) {
    return { message: 'The recording is empty.', ok: false, status: 400 };
  }

  if (audio.size > MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES) {
    return {
      message: 'The recording exceeds the inline transcription limit.',
      ok: false,
      status: 413,
    };
  }

  const baseMediaType = audio.type.split(';', 1)[0]?.trim().toLowerCase();
  const mediaType = TRANSCRIPTION_AUDIO_MEDIA_TYPES.find(
    (allowedMediaType) => allowedMediaType === baseMediaType
  );
  if (!mediaType) {
    return {
      message:
        'The recording format is not supported for inline transcription.',
      ok: false,
      status: 415,
    };
  }

  return { mediaType, ok: true };
}

export function hasOversizedDeclaredContentLength(req: Request) {
  const contentLength = req.headers.get('content-length')?.trim();
  if (!contentLength || !/^\d+$/u.test(contentLength)) {
    return false;
  }

  return (
    BigInt(contentLength) > BigInt(MAX_TRANSCRIPTION_MULTIPART_REQUEST_BYTES)
  );
}

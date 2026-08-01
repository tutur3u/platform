/**
 * Ordered by transcription friendliness first, browser support second. Opus in
 * a WebM container is what the existing transcription pipeline handles best;
 * the MP4 entries are the Safari fallbacks.
 */
export const RECORDER_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
] as const;

/**
 * Picks the first container the browser can actually record. Returns undefined
 * when none match, which tells `MediaRecorder` to use its own default rather
 * than throwing on an unsupported `mimeType`.
 */
export function pickRecorderMimeType(
  isSupported: (type: string) => boolean
): string | undefined {
  return RECORDER_MIME_TYPES.find((type) => isSupported(type));
}

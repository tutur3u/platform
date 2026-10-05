import { createHash } from 'node:crypto';
import { NotesVoiceError } from './schema';
export const MAX_NOTES_VOICE_BYTES = 4 * 1024 * 1024;
/** Native Notes sends mono 16kHz PCM16 WAV, so duration is verified from frames, not client metadata. */
export function validateNotesVoiceAudio(bytes: Uint8Array) {
  if (bytes.length < 44 || bytes.length > MAX_NOTES_VOICE_BYTES)
    throw new NotesVoiceError(413, 'invalid_audio_size');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, size: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + size));
  if (
    text(0, 4) !== 'RIFF' ||
    text(8, 4) !== 'WAVE' ||
    view.getUint32(4, true) + 8 !== bytes.length
  )
    throw new NotesVoiceError(415, 'invalid_wav');
  let format = false;
  let dataBytes = 0;
  for (let offset = 12; offset < bytes.length; ) {
    if (offset + 8 > bytes.length)
      throw new NotesVoiceError(415, 'invalid_wav');
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + length > bytes.length)
      throw new NotesVoiceError(415, 'invalid_wav');
    const kind = text(offset, 4);
    if (kind === 'fmt ') {
      if (
        format ||
        length < 16 ||
        view.getUint16(start, true) !== 1 ||
        view.getUint16(start + 2, true) !== 1 ||
        view.getUint32(start + 4, true) !== 16000 ||
        view.getUint32(start + 8, true) !== 32000 ||
        view.getUint16(start + 12, true) !== 2 ||
        view.getUint16(start + 14, true) !== 16
      )
        throw new NotesVoiceError(415, 'unsupported_wav');
      format = true;
    }
    if (kind === 'data') {
      if (dataBytes || length % 2)
        throw new NotesVoiceError(415, 'invalid_wav');
      dataBytes = length;
    }
    offset = start + length + (length % 2);
  }
  if (!format || !dataBytes || dataBytes / 32000 > 120)
    throw new NotesVoiceError(413, 'recording_limit');
  return dataBytes / 32000;
}
export function notesVoiceInputHash(bytes: Uint8Array, timezone: string) {
  return createHash('sha256')
    .update(timezone)
    .update('\0')
    .update(bytes)
    .digest('hex');
}

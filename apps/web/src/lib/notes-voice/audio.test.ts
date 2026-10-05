// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { notesVoiceInputHash, validateNotesVoiceAudio } from './audio';

function wav(seconds = 1) {
  const bytes = new Uint8Array(44 + seconds * 32000);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) =>
    [...text].forEach((value, index) => {
      bytes[offset + index] = value.charCodeAt(0);
    });
  write(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, bytes.length - 44, true);
  return bytes;
}
describe('Notes voice byte and duration boundary', () => {
  it.each([1, 120])('accepts %s seconds verified mono PCM', (seconds) =>
    expect(validateNotesVoiceAudio(wav(seconds))).toBe(seconds)
  );
  it('rejects longer audio despite a short client duration claim', () =>
    expect(() => validateNotesVoiceAudio(wav(121))).toThrow(
      expect.objectContaining({ code: 'recording_limit' })
    ));
  it.each([
    ['channels', 22, 2],
    ['format', 20, 3],
    ['bits', 34, 8],
  ])('rejects unsupported %s', (_name, offset, value) => {
    const bytes = wav();
    new DataView(bytes.buffer).setUint16(
      offset as number,
      value as number,
      true
    );
    expect(() => validateNotesVoiceAudio(bytes)).toThrow(
      expect.objectContaining({ code: 'unsupported_wav' })
    );
  });
  it('rejects truncated chunks and mislabeled compressed files', () => {
    expect(() => validateNotesVoiceAudio(wav().subarray(0, 100))).toThrow();
    expect(() => validateNotesVoiceAudio(new Uint8Array(100))).toThrow();
  });
  it('binds retry identity to audio and time zone', () => {
    const bytes = wav();
    const hash = notesVoiceInputHash(bytes, 'UTC');
    expect(notesVoiceInputHash(bytes, 'UTC')).toBe(hash);
    expect(notesVoiceInputHash(bytes, 'Asia/Ho_Chi_Minh')).not.toBe(hash);
    bytes[45] = 1;
    expect(notesVoiceInputHash(bytes, 'UTC')).not.toBe(hash);
  });
});

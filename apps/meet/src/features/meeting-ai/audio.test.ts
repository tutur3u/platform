import { describe, expect, it } from 'vitest';
import { encodeMeetWav } from './audio';

describe('meeting PCM transport', () => {
  it('encodes a self-contained mono 16 kHz WAV for every chunk', async () => {
    const blob = encodeMeetWav(new Float32Array([0, 1, -1, 2]));
    const bytes = await blob.arrayBuffer();
    const view = new DataView(bytes);
    expect(blob.type).toBe('audio/wav');
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32767);
    expect(view.getInt16(50, true)).toBe(32767);
  });
});

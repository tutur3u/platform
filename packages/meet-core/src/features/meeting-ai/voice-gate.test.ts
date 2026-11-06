import { expect, it } from 'vitest';
import { hasMeetSpeech } from './audio';

it('rejects silence and subthreshold audio but preserves speech', () => {
  expect(hasMeetSpeech(new Float32Array())).toBe(false);
  expect(hasMeetSpeech(new Float32Array(16000))).toBe(false);
  expect(hasMeetSpeech(new Float32Array([0.0001]))).toBe(false);
  expect(hasMeetSpeech(new Float32Array([0.1, -0.1]))).toBe(true);
  expect(hasMeetSpeech(new Float32Array([0.1]), 0.02)).toBe(false);
  expect(() => hasMeetSpeech(new Float32Array([1]), -1)).toThrow();
});

it('retains quiet short utterances at either edge of a full ten-second window', () => {
  for (const start of [0, 159680]) {
    const speech = new Float32Array(160000);
    for (let i = start; i < start + 320; i++)
      speech[i] = 0.002 * Math.sin(((i - start) * Math.PI) / 8);
    expect(
      speech.reduce((sum, value) => sum + value * value, 0) / speech.length
    ).toBeLessThan(0.000001);
    expect(hasMeetSpeech(speech)).toBe(true);
    expect(hasMeetSpeech(speech, 0.00001)).toBe(false);
  }
});

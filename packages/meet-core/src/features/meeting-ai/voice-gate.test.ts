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

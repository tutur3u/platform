import { expect, it } from 'vitest';
import {
  type AudioFingerprint,
  AudioOverlapEvidence,
  audioOverlapScore,
} from './audio-overlap';

function voice(phase = 0): AudioFingerprint[] {
  return Array.from({ length: 64 }, (_, i) => {
    const spectrum = Array.from(
      { length: 12 },
      (_, band) =>
        0.4 + 0.3 * Math.sin((i + phase) * (0.13 + band * 0.11) + band)
    );
    const norm = Math.hypot(...spectrum);
    return {
      level: -3 + Math.sin((i + phase) * 0.73) * 0.8,
      spectrum: spectrum.map((x) => x / norm),
    };
  });
}
it('recognizes the same changing audio despite delay and microphone gain', () => {
  const original = voice();
  const delayed = [...voice(90).slice(0, 6), ...original.slice(0, 58)].map(
    (x) => ({ ...x, level: x.level - 0.4 })
  );
  expect(audioOverlapScore(original, delayed)).toBeGreaterThan(0.99);
  expect(audioOverlapScore(delayed, original)).toBeGreaterThan(0.99);
});
it('does not treat independent speech, silence, or steady tones as overlap', () => {
  expect(audioOverlapScore(voice(), voice(51))).toBe(0);
  const silence = voice().map((x) => ({ ...x, level: -12 }));
  expect(audioOverlapScore(silence, silence)).toBe(0);
  const tone = voice().map((x) => ({ ...x, spectrum: [1, 0, 0, 0, 0] }));
  expect(audioOverlapScore(tone, tone)).toBe(0);
  expect(audioOverlapScore([], voice())).toBe(0);
});
it('requires three spaced observations and resets on gaps or non-matches', () => {
  const evidence = new AudioOverlapEvidence();
  expect(evidence.observe('a', 1, 1000)).toBe(false);
  expect(evidence.observe('a', 1, 1100)).toBe(false);
  expect(evidence.observe('a', 1, 1400)).toBe(false);
  expect(evidence.observe('a', 1, 1800)).toBe(true);
  expect(evidence.observe('a', Number.NaN, 2200)).toBe(false);
  expect(evidence.observe('a', 1, 2600)).toBe(false);
  expect(evidence.observe('a', 1, 4000)).toBe(false);
  expect(evidence.observe('a', 1, 4400)).toBe(false);
  evidence.clear();
  expect(evidence.observe('a', 1, 4800)).toBe(false);
});

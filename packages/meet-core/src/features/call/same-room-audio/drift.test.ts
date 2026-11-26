import { expect, it } from 'vitest';
import { fitClockDrift, gccPhatOffset } from './drift';

it('recovers a 7 ms offset and 50 ppm drift with independent noise', () => {
  const sampleRate = 8000;
  const windowSamples = 2048;
  let seed = 12345;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 31 - 1;
  };
  const windows = [0, 5, 14, 27, 41, 59, 77, 91].map((timeSeconds) => {
    const signal = Float32Array.from({ length: windowSamples + 256 }, () =>
      random()
    );
    const delay = sampleRate * (0.007 + timeSeconds * 50e-6);
    const reference = signal.slice(128, 128 + windowSamples);
    const target = Float32Array.from({ length: windowSamples }, (_, index) => {
      const position = 128 + index - delay - (index - 1024) * 50e-6;
      const lower = Math.floor(position);
      const fraction = position - lower;
      return (
        signal[lower]! * (1 - fraction) +
        signal[lower + 1]! * fraction +
        0.12 * random()
      );
    });
    const measured = gccPhatOffset({
      reference,
      target,
      maxLagSamples: 120,
    });
    expect(measured?.peakRatio).toBeGreaterThan(2);
    return { timeSeconds, delaySamples: measured!.delaySamples };
  });

  const fit = fitClockDrift(windows, sampleRate)!;
  const offsetError = Math.abs(fit.offsetMs - 7);
  const driftError = Math.abs(fit.driftPpm - 50);
  console.info(
    `GCC-PHAT offset error ${offsetError.toFixed(4)} ms, ` +
      `drift error ${driftError.toFixed(3)} ppm, ` +
      `fit residual ${fit.rmsResidualMs.toFixed(4)} ms RMS`
  );
  expect(offsetError).toBeLessThan(0.15);
  expect(driftError).toBeLessThan(2);
  expect(fit.rmsResidualMs).toBeLessThan(0.15);
});

it('returns no observation for silence or a zero-duration drift fit', () => {
  const silence = new Float32Array(64);
  expect(
    gccPhatOffset({
      reference: silence,
      target: silence,
      maxLagSamples: 8,
    })
  ).toBeNull();
  expect(
    fitClockDrift(
      [
        { timeSeconds: 0, delaySamples: 1 },
        { timeSeconds: 0, delaySamples: 2 },
      ],
      8000
    )
  ).toBeNull();
});

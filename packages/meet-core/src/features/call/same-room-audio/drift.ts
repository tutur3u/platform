type Spectrum = { real: Float64Array; imaginary: Float64Array };

function fft({ real, imaginary }: Spectrum, inverse = false) {
  const size = real.length;
  for (let index = 1, reversed = 0; index < size; index++) {
    let bit = size >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed]!, real[index]!];
      [imaginary[index], imaginary[reversed]] = [
        imaginary[reversed]!,
        imaginary[index]!,
      ];
    }
  }

  for (let width = 2; width <= size; width *= 2) {
    const step = ((inverse ? 2 : -2) * Math.PI) / width;
    for (let column = 0; column < width / 2; column++) {
      const cosine = Math.cos(step * column);
      const sine = Math.sin(step * column);
      for (let left = column; left < size; left += width) {
        const right = left + width / 2;
        const rightReal = real[right]! * cosine - imaginary[right]! * sine;
        const rightImag = real[right]! * sine + imaginary[right]! * cosine;
        real[right] = real[left]! - rightReal;
        imaginary[right] = imaginary[left]! - rightImag;
        real[left] = real[left]! + rightReal;
        imaginary[left] = imaginary[left]! + rightImag;
      }
    }
  }
  // Peak search uses relative amplitudes, so inverse scaling cancels.
}

function windowSpectrum(samples: Float32Array, size: number): Spectrum {
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  const mean =
    samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  for (const [index, sample] of samples.entries()) {
    const phase = (2 * Math.PI * index) / (samples.length - 1);
    real[index] = (sample - mean) * (0.5 - 0.5 * Math.cos(phase));
  }
  fft({ real, imaginary });
  return { real, imaginary };
}

/** Positive delay means the target samples lag the reference samples. */
export function gccPhatOffset({
  reference,
  target,
  maxLagSamples,
}: {
  reference: Float32Array;
  target: Float32Array;
  maxLagSamples: number;
}): { delaySamples: number; peakRatio: number } | null {
  if (
    reference.length !== target.length ||
    !Number.isInteger(maxLagSamples) ||
    maxLagSamples < 1 ||
    maxLagSamples >= reference.length / 2
  ) {
    throw new RangeError('Use equal windows and a lag below half their length');
  }
  const size = 2 ** Math.ceil(Math.log2(reference.length * 2));
  const base = windowSpectrum(reference, size);
  const other = windowSpectrum(target, size);
  for (let bin = 0; bin < size; bin++) {
    // Target times the conjugate of the reference.
    const re =
      other.real[bin]! * base.real[bin]! +
      other.imaginary[bin]! * base.imaginary[bin]!;
    const im =
      other.imaginary[bin]! * base.real[bin]! -
      other.real[bin]! * base.imaginary[bin]!;
    const magnitude = Math.hypot(re, im);
    other.real[bin] = magnitude > 1e-12 ? re / magnitude : 0;
    other.imaginary[bin] = magnitude > 1e-12 ? im / magnitude : 0;
  }
  fft(other, true);
  const score = (lag: number) => Math.abs(other.real[(lag + size) % size]!);
  let best = 0;
  for (let lag = -maxLagSamples; lag <= maxLagSamples; lag++) {
    if (score(lag) > score(best)) best = lag;
  }
  const peak = score(best);
  if (!(peak > 0) || Math.abs(best) === maxLagSamples) return null;
  let second = 0;
  for (let lag = -maxLagSamples; lag <= maxLagSamples; lag++) {
    if (Math.abs(lag - best) > 2) second = Math.max(second, score(lag));
  }
  const left = score(best - 1);
  const right = score(best + 1);
  const curvature = left - 2 * peak + right;
  const fraction = curvature < 0 ? (0.5 * (left - right)) / curvature : 0;
  return {
    delaySamples: best + fraction,
    peakRatio: peak / Math.max(second, 1e-12),
  };
}

export type OffsetObservation = {
  timeSeconds: number;
  delaySamples: number;
};

/** Fits target delay at time zero and fractional sample-clock drift. */
export function fitClockDrift(
  windows: readonly OffsetObservation[],
  sampleRate: number
): { offsetMs: number; driftPpm: number; rmsResidualMs: number } | null {
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    windows.length < 2 ||
    windows.some(
      ({ timeSeconds, delaySamples }) =>
        !Number.isFinite(timeSeconds) || !Number.isFinite(delaySamples)
    )
  ) {
    return null;
  }
  const count = windows.length;
  const meanTime =
    windows.reduce((sum, row) => sum + row.timeSeconds, 0) / count;
  const meanDelay =
    windows.reduce((sum, row) => sum + row.delaySamples, 0) / count;
  let timeVariance = 0;
  let covariance = 0;
  for (const { timeSeconds, delaySamples } of windows) {
    const time = timeSeconds - meanTime;
    timeVariance += time * time;
    covariance += time * (delaySamples - meanDelay);
  }
  if (timeVariance === 0) return null;
  const slope = covariance / timeVariance;
  const offset = meanDelay - slope * meanTime;
  const error = windows.reduce(
    (sum, { timeSeconds, delaySamples }) =>
      sum + (delaySamples - offset - slope * timeSeconds) ** 2,
    0
  );
  return {
    offsetMs: (1000 * offset) / sampleRate,
    driftPpm: (1e6 * slope) / sampleRate,
    rmsResidualMs: (1000 * Math.sqrt(error / count)) / sampleRate,
  };
}

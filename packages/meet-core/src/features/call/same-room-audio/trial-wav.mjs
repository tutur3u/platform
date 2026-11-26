const pcmGuidSuffix = '00001000800000aa00389b71';

export function parseWav(bytes) {
  if (
    bytes.length < 12 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('Expected a little-endian RIFF/WAVE recording');
  }
  const end = 8 + bytes.readUInt32LE(4);
  if (end < 12 || end > bytes.length) throw new Error('Truncated RIFF');
  let format;
  let data;
  let offset = 12;
  while (offset + 8 <= end) {
    const kind = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    offset = start + length + (length % 2);
    if (offset > end) throw new Error(`Truncated WAV chunk ${kind}`);
    if (kind === 'fmt ') format = bytes.subarray(start, start + length);
    if (kind === 'data') data = bytes.subarray(start, start + length);
  }
  if (offset !== end || !format || format.length < 16 || !data?.length) {
    throw new Error('Expected complete fmt and nonempty data chunks');
  }

  let encoding = format.readUInt16LE(0);
  const channels = format.readUInt16LE(2);
  const sampleRate = format.readUInt32LE(4);
  const bytesPerSample = format.readUInt16LE(12);
  const bits = format.readUInt16LE(14);
  if (encoding === 0xfffe) {
    if (
      format.length < 40 ||
      format.readUInt16LE(16) < 22 ||
      format.readUInt16LE(18) !== bits ||
      format.toString('hex', 28, 40) !== pcmGuidSuffix
    ) {
      throw new Error('Unsupported WAVE_FORMAT_EXTENSIBLE format');
    }
    encoding = format.readUInt32LE(24);
  }
  const pcm16 = encoding === 1 && bits === 16;
  const float32 = encoding === 3 && bits === 32;
  if (
    channels !== 1 ||
    !(pcm16 || float32) ||
    sampleRate === 0 ||
    bytesPerSample !== bits / 8 ||
    data.length % bytesPerSample !== 0
  ) {
    throw new Error('Expected mono PCM16 or mono float32 WAV');
  }
  const samples = new Float32Array(data.length / bytesPerSample);
  for (let i = 0; i < samples.length; i++) {
    const byte = i * bytesPerSample;
    const sample = pcm16
      ? data.readInt16LE(byte) / 32768
      : data.readFloatLE(byte);
    if (!Number.isFinite(sample)) throw new Error('Nonfinite WAV sample');
    samples[i] = sample;
  }
  return { pcm16, sampleRate, samples };
}

export function rms(samples) {
  return Math.sqrt(
    samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length
  );
}

export function clipping({ pcm16 }, samples) {
  const positiveRail = pcm16 ? 32767 / 32768 : 1;
  let fullScale = 0;
  let longestRun = 0;
  let run = 0;
  let previous = 0;
  for (const sample of samples) {
    if (sample <= -1 || sample >= positiveRail) {
      fullScale++;
      run = previous === sample ? run + 1 : 1;
      longestRun = Math.max(longestRun, run);
    } else {
      run = 0;
    }
    previous = sample;
  }
  return { percent: (100 * fullScale) / samples.length, longestRun };
}

export function takeSamples({ samples, sampleRate }, [start, end]) {
  const first = Math.round(start * sampleRate);
  const last = Math.round(end * sampleRate);
  if (first < 0 || last > samples.length || first >= last) {
    throw new Error(`Window [${start}, ${end}] is outside its recording`);
  }
  return samples.subarray(first, last);
}

export function detectOnset(wav, window, floor) {
  const samples = takeSamples(wav, window);
  const frame = Math.max(1, Math.round(wav.sampleRate / 1000));
  for (let index = 0; index + frame <= samples.length; index += frame) {
    if (rms(samples.subarray(index, index + frame)) >= floor) {
      return (Math.round(window[0] * wav.sampleRate) + index) / wav.sampleRate;
    }
  }
  return null;
}

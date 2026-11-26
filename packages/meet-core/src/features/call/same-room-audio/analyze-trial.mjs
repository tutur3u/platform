import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  clipping,
  detectOnset,
  parseWav,
  rms,
  takeSamples,
} from './trial-wav.mjs';

const amplitude = (dbfs) => 10 ** (dbfs / 20);
const dbfs = (value) => 20 * Math.log10(value);
const timingLimitMs = 10;
const failoverLimitMs = 300;
const frameSeconds = 0.01;

function check(condition, message) {
  if (!condition) throw new Error(message);
}
const validWindow = (window) =>
  Array.isArray(window) &&
  window.length === 2 &&
  window.every(Number.isFinite) &&
  window[0] < window[1];

export function alignRecording(wav, windows, floor, duration) {
  const markers = windows.map((window) => detectOnset(wav, window, floor));
  const [first, middle, last] = markers;
  check(
    first !== null &&
      middle !== null &&
      last !== null &&
      first < middle &&
      middle < last,
    'Three distinct sync claps must be audible in each recording'
  );
  const scale = (duration ?? last - first) / (last - first);
  return {
    wav,
    elapsed: (seconds) => (seconds - first) * scale,
    local: (seconds) => first + seconds / scale,
    duration: (last - first) * scale,
    middle: (middle - first) * scale,
  };
}

const samplesAt = (recording, window) =>
  takeSamples(recording.wav, window.map(recording.local));

export function clapLatency(source, receiver, windows, floor) {
  const delays = windows.map((window) => {
    const onsets = [source, receiver].map((recording) => {
      const time = detectOnset(
        recording.wav,
        window.map(recording.local),
        floor
      );
      return time === null ? null : recording.elapsed(time);
    });
    return onsets.includes(null) ? null : 1000 * (onsets[1] - onsets[0]);
  });
  if (delays.includes(null)) return null;
  delays.sort((a, b) => a - b);
  const middle = Math.floor(delays.length / 2);
  const median =
    delays.length % 2
      ? delays[middle]
      : (delays[middle - 1] + delays[middle]) / 2;
  return { median, max: delays.at(-1), min: delays[0] };
}

export function measureFailover(recordings, window, at, floor, errorMs) {
  const frameCount = Math.floor((window[1] - window[0]) / frameSeconds);
  const time = (index) => window[0] + index * frameSeconds;
  const audible = Array.from({ length: frameCount }, (_, index) =>
    recordings.some(
      (recording) =>
        rms(samplesAt(recording, [time(index), time(index + 1)])) >= floor
    )
  );
  if (!audible[0] || !audible.at(-1)) return null;
  const errorSeconds = errorMs / 1000;
  const candidates = [];
  for (let index = 0; index < frameCount; index++) {
    if (audible[index]) continue;
    const start = index;
    while (!audible[index]) index++;
    const low = time(start);
    const high = time(index);
    if (low <= at + errorSeconds && high >= at - errorSeconds) {
      candidates.push({
        audioGapMs: 1000 * (high - low),
        traceToAudioMs: 1000 * Math.max(0, high - at),
      });
    }
  }
  if (candidates.length > 1) return null;
  return candidates[0] ?? { audioGapMs: 0, traceToAudioMs: 0 };
}

function meterPhase(phase, recordings, source, remote, floor) {
  const { claps, loud, echo } = phase;
  check(
    Array.isArray(claps) &&
      claps.length === 10 &&
      claps.every(validWindow) &&
      validWindow(echo) &&
      Array.isArray(loud) &&
      loud.length === 3 &&
      loud.every(validWindow),
    'Each phase needs ten clap windows, three loud windows and an echo window'
  );
  return {
    latency: clapLatency(source, remote, claps, floor),
    clips: recordings.map((recording) => {
      const phrases = loud.map((window) =>
        clipping(recording.wav, samplesAt(recording, window))
      );
      return {
        percent: Math.max(...phrases.map(({ percent }) => percent)),
        longestRun: Math.max(...phrases.map(({ longestRun }) => longestRun)),
      };
    }),
    echo: dbfs(rms(samplesAt(remote, echo))),
  };
}

function measureTrace(trace, clock, window, recordings, floor, errorMs) {
  check(
    trace.version === 1 &&
      typeof trace.listenerId === 'string' &&
      Array.isArray(trace.events) &&
      trace.events.every(
        (event) =>
          event && Number.isFinite(event.atMs) && typeof event.kind === 'string'
      ),
    'Expected a version 1 trial trace'
  );
  const sync = trace.events.filter(({ kind }) => kind === 'sync');
  check(
    sync.length === 3 &&
      sync.every(
        ({ atMs }, index) => index === 0 || sync[index - 1].atMs < atMs
      ),
    'Trace needs three increasing sync timestamps'
  );
  const relative = (atMs) =>
    ((atMs - sync[0].atMs) / (sync[2].atMs - sync[0].atMs)) * clock.duration;
  const anchorError = 1000 * Math.abs(relative(sync[1].atMs) - clock.middle);
  if (anchorError > errorMs) return { anchorError, gaps: [] };
  const gaps = trace.events
    .filter(({ kind }) => kind === 'failover')
    .map(({ atMs }) => relative(atMs))
    .filter((at) => window[0] < at && at < window[1])
    .map((at) => measureFailover(recordings, window, at, floor, errorMs));
  return { anchorError, gaps };
}

const verdict = (condition) =>
  condition === null ? 'INCONCLUSIVE' : condition ? 'PASS' : 'FAIL';
const fixed = (value) => (Number.isFinite(value) ? value.toFixed(2) : '-inf');

const latencyLabel = (latency) =>
  latency ? `${fixed(latency.median)} / ${fixed(latency.max)}` : 'missing';

export function analyzeTrial(config, base) {
  const {
    room,
    remote,
    baseline,
    designated,
    trace,
    onsetDbfs = -35,
    toneDbfs = -40,
    clockErrorMs,
    traceErrorMs,
  } = config;
  check(
    Array.isArray(room) &&
      room.length >= 2 &&
      trace &&
      Number.isInteger(trace.roomIndex) &&
      !!room[trace.roomIndex] &&
      typeof trace.file === 'string' &&
      baseline &&
      designated &&
      validWindow(designated.failover),
    'Provide two or more room WAVs, both phases, and the backup laptop trace'
  );
  check(
    [onsetDbfs, toneDbfs].every(
      (value) => Number.isFinite(value) && value < 0
    ) &&
      [clockErrorMs, traceErrorMs].every(
        (value) => Number.isFinite(value) && value >= 0
      ),
    'Provide valid onset/tone thresholds and measured clock/trace errors'
  );
  const floor = amplitude(onsetDbfs);
  const recordings = [...room, remote].map((entry) => {
    check(
      entry &&
        typeof entry.file === 'string' &&
        Array.isArray(entry.sync) &&
        entry.sync.length === 3 &&
        entry.sync.every(validWindow),
      'Every WAV needs a file and three approximate sync-clap windows'
    );
    return {
      entry,
      wav: parseWav(readFileSync(resolve(base, entry.file))),
    };
  });
  const first = recordings[0];
  const source = alignRecording(first.wav, first.entry.sync, floor);
  const aligned = recordings.map(({ entry, wav }) =>
    alignRecording(wav, entry.sync, floor, source.duration)
  );
  const receiver = aligned.at(-1);
  const clockError = Math.max(
    clockErrorMs,
    ...aligned.map(({ middle }) => 1000 * Math.abs(middle - source.middle))
  );
  const all = meterPhase(baseline, aligned, source, receiver, floor);
  const one = meterPhase(designated, aligned, source, receiver, floor);
  const { anchorError, gaps } = measureTrace(
    JSON.parse(readFileSync(resolve(base, trace.file), 'utf8')),
    aligned[trace.roomIndex],
    designated.failover,
    aligned.slice(0, -1),
    amplitude(toneDbfs),
    traceErrorMs
  );
  const latency =
    all.latency &&
    one.latency &&
    clockError <= timingLimitMs &&
    Math.min(all.latency.min, one.latency.min) >= -clockError;
  const rows = [
    {
      metric: 'Clap latency (median / max ms)',
      baseline: latencyLabel(all.latency),
      designated: latencyLabel(one.latency),
      result: verdict(
        latency
          ? one.latency.median <= 250 &&
              one.latency.median - all.latency.median <= 60
          : null
      ),
    },
    {
      metric: 'Returned echo (dBFS RMS)',
      baseline: fixed(all.echo),
      designated: fixed(one.echo),
      result: verdict(
        (all.echo <= -40 && one.echo <= -40) || all.echo - one.echo >= 6
      ),
    },
    ...recordings.map(({ entry }, index) => {
      const label = ({ percent, longestRun }) =>
        `${percent.toFixed(4)}% / ${longestRun} samples`;
      const acceptable = ({ percent, longestRun }) =>
        percent <= 0.1 && longestRun < 5;
      return {
        metric: `Clipping (${entry.file})`,
        baseline: label(all.clips[index]),
        designated: label(one.clips[index]),
        result: verdict(
          acceptable(all.clips[index]) && acceptable(one.clips[index])
        ),
      };
    }),
  ];
  const gapUncertainty = clockError + traceErrorMs + frameSeconds * 1000;
  const measurable =
    gaps.length &&
    gaps.every(Boolean) &&
    clockError <= timingLimitMs &&
    gapUncertainty < failoverLimitMs;
  const worst = measurable
    ? Math.max(
        ...gaps.map((gap) => Math.max(gap.audioGapMs, gap.traceToAudioMs))
      )
    : null;
  rows.push({
    metric: 'Failover (audio gap / trace-to-audio ms)',
    baseline: '—',
    designated:
      gaps
        .map((gap) =>
          gap
            ? `${fixed(gap.audioGapMs)} / ${fixed(gap.traceToAudioMs)}`
            : 'missing'
        )
        .join(', ') || 'missing',
    result: verdict(
      worst === null
        ? null
        : worst - gapUncertainty > failoverLimitMs
          ? false
          : worst + gapUncertainty <= failoverLimitMs
            ? true
            : null
    ),
  });
  return { rows, clockError, anchorError, gapUncertainty };
}

function main() {
  const manifest = process.argv[2];
  check(manifest, 'Usage: node analyze-trial.mjs manifest.json');
  const { rows, clockError, anchorError, gapUncertainty } = analyzeTrial(
    JSON.parse(readFileSync(manifest, 'utf8')),
    dirname(resolve(manifest))
  );
  console.info(
    `Recorder alignment error: ${fixed(clockError)} ms. ` +
      `Trace checkpoint error: ${fixed(anchorError)} ms. ` +
      `Failover timing uncertainty: ±${fixed(gapUncertainty)} ms.`
  );
  console.table(rows);
  if (rows.some(({ result }) => result === 'FAIL')) process.exitCode = 1;
  else if (rows.some(({ result }) => result === 'INCONCLUSIVE')) {
    process.exitCode = 2;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

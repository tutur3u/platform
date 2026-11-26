import assert from 'node:assert/strict';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  alignRecording,
  analyzeTrial,
  clapLatency,
  measureFailover,
} from './analyze-trial.mjs';
import { clipping, parseWav } from './trial-wav.mjs';

const sampleRate = 8000;

function chunk(name, data) {
  const bytes = Buffer.alloc(8 + data.length + (data.length % 2));
  bytes.write(name);
  bytes.writeUInt32LE(data.length, 4);
  data.copy(bytes, 8);
  return bytes;
}

function wav(samples, { pcm16 = false, extensible = false } = {}) {
  const width = pcm16 ? 2 : 4;
  const format = Buffer.alloc(extensible ? 40 : 16);
  const encoding = pcm16 ? 1 : 3;
  format.writeUInt16LE(extensible ? 0xfffe : encoding, 0);
  format.writeUInt16LE(1, 2);
  format.writeUInt32LE(sampleRate, 4);
  format.writeUInt32LE(sampleRate * width, 8);
  format.writeUInt16LE(width, 12);
  format.writeUInt16LE(width * 8, 14);
  if (extensible) {
    format.writeUInt16LE(22, 16);
    format.writeUInt16LE(width * 8, 18);
    format.writeUInt32LE(encoding, 24);
    format.write('00001000800000aa00389b71', 28, 'hex');
  }
  const data = Buffer.alloc(width * samples.length);
  samples.forEach((sample, index) => {
    if (pcm16) data.writeInt16LE(sample, index * width);
    else data.writeFloatLE(sample, index * width);
  });
  const body = Buffer.concat([
    Buffer.from('WAVE'),
    chunk('JUNK', Buffer.from([0xff])),
    chunk('fmt ', format),
    chunk('data', data),
  ]);
  return chunk('RIFF', body);
}

test('reads padded chunks and both PCM16 rails', () => {
  const recording = parseWav(
    wav([0, 32767, 32767, -32768, -32768, -32768, 16384], { pcm16: true })
  );
  assert.equal(recording.sampleRate, sampleRate);
  assert.deepEqual(
    [...recording.samples],
    [0, 32767 / 32768, 32767 / 32768, -1, -1, -1, 0.5]
  );
  assert.deepEqual(clipping(recording, recording.samples), {
    percent: 500 / 7,
    longestRun: 3,
  });
});

test('reads extensible float32 and rejects invalid input', () => {
  const bytes = wav([0.25, -0.5, 1.25], { extensible: true });
  const recording = parseWav(bytes);
  assert.deepEqual([...recording.samples], [0.25, -0.5, 1.25]);
  assert.equal(clipping(recording, recording.samples).longestRun, 1);
  assert.throws(() => parseWav(bytes.subarray(0, -1)), /Truncated RIFF/);
  assert.throws(() => parseWav(wav([NaN])), /Nonfinite WAV sample/);
});

function signal(seconds) {
  const data = new Float32Array(seconds * sampleRate);
  const fill = (start, end, value) => {
    const first = Math.round(start * sampleRate);
    const last = Math.round(end * sampleRate);
    data.fill(value, first, last);
  };
  const pulse = (at) => fill(at, at + 0.01, 0.5);
  return { data, fill, pulse };
}

function near(actual, expected, tolerance = 1) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} within ${tolerance} of ${expected}`
  );
}

const sharedSync = [
  [0.9, 1.1],
  [1.9, 2.1],
  [29.9, 30.1],
];
const phase = (start) => ({
  claps: Array.from({ length: 10 }, (_, index) => {
    const clap = start + 0.5 * index;
    return [clap - 0.05, clap + 0.35];
  }),
  loud: [
    [start + 5, start + 5.2],
    [start + 5.3, start + 5.6],
    [start + 5.7, start + 6],
  ],
  echo: [start + 6, start + 7],
});

test('reports calibrated latency, echo, clipping and roster failover', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'meet-audio-trial-'));
  const files = [];
  t.after(() => {
    for (const file of files) unlinkSync(file);
    rmdirSync(directory);
  });
  const save = (name, content) => {
    const file = join(directory, name);
    writeFileSync(file, content);
    files.push(file);
  };
  const a = signal(32);
  const b = signal(32);
  const remote = signal(32);
  for (const at of [1, 2, 30]) {
    a.pulse(at);
    b.pulse(at);
    remote.pulse(at + 0.2);
  }
  const baseline = phase(3);
  const designated = { ...phase(14), failover: [22, 24] };
  for (const [claps, latency] of [
    [baseline.claps, 0.1],
    [designated.claps, 0.12],
  ]) {
    for (const [start] of claps) {
      a.pulse(start + 1.05);
      remote.pulse(start + 1.25 + latency);
    }
  }
  remote.fill(10.2, 11.2, 0.1);
  remote.fill(21.2, 22.2, 0.025);
  a.fill(23, 23.8, 0.2);
  b.fill(23.9, 25, 0.2);
  save('a.wav', wav(a.data));
  save('b.wav', wav(b.data));
  save('remote.wav', wav(remote.data));
  save(
    'trace.json',
    JSON.stringify({
      version: 1,
      listenerId: 'room-b',
      events: [
        { atMs: 5000, kind: 'sync' },
        { atMs: 6000, kind: 'sync' },
        { atMs: 27850, kind: 'failover' },
        { atMs: 34000, kind: 'sync' },
      ],
    })
  );
  const result = analyzeTrial(
    {
      room: [
        { file: 'a.wav', sync: sharedSync },
        { file: 'b.wav', sync: sharedSync },
      ],
      remote: {
        file: 'remote.wav',
        sync: sharedSync.map((window) => window.map((at) => at + 0.2)),
      },
      baseline,
      designated,
      trace: { file: 'trace.json', roomIndex: 1 },
      clockErrorMs: 3,
      traceErrorMs: 25,
    },
    directory
  );

  assert.equal(result.rows.length, 6);
  assert.ok(result.rows.every(({ result }) => result === 'PASS'));
  near(parseFloat(result.rows[0].baseline), 100);
  near(parseFloat(result.rows[0].designated), 120);
  near(parseFloat(result.rows[1].baseline), -20);
  near(parseFloat(result.rows[1].designated), -32.04);
  near(parseFloat(result.rows.at(-1).designated), 100, 11);
});

test('missing clap or sustained recovery yields no measurement', () => {
  const audio = signal(32);
  for (const at of [1, 2, 30]) audio.pulse(at);
  audio.pulse(3);
  const recording = alignRecording(parseWav(wav(audio.data)), sharedSync, 0.02);
  assert.equal(clapLatency(recording, recording, [[4, 5]], 0.02), null);
  assert.equal(measureFailover([recording], [4, 5], 4.5, 0.02, 25), null);
});

import { describe, expect, it } from 'vitest';
import {
  SELF_CHUNK_MAX_SAMPLES,
  SELF_FRAME_SAMPLES,
  SelfChunker,
  type SelfChunk,
} from './self-chunker';

const loud = () => new Float32Array(SELF_FRAME_SAMPLES).fill(0.1);
const quiet = () => new Float32Array(SELF_FRAME_SAMPLES);
function run(parts: Array<[() => Float32Array, number]>) {
  const chunks: SelfChunk[] = [];
  const chunker = new SelfChunker((chunk) => chunks.push(chunk));
  for (const [frame, count] of parts)
    for (let i = 0; i < count; i++) chunker.push(frame());
  return { chunker, chunks };
}

describe('self chunker', () => {
  it('uploads nothing for silence but still advances the timeline', () => {
    const { chunker, chunks } = run([[quiet, 500]]);
    expect(chunks).toHaveLength(0);
    expect(chunker.dropped).toBe(0);
    expect(chunker.timeline).toBe(500 * SELF_FRAME_SAMPLES);
  });

  it('flushes after 2 s of silence and trims everything past the hangover', () => {
    const { chunks } = run([
      [loud, 75],
      [quiet, 110],
    ]);
    expect(chunks).toHaveLength(0);
    const flushed = run([
      [loud, 75],
      [quiet, 200],
    ]).chunks;
    expect(flushed).toHaveLength(1);
    // 1.5 s of speech plus the 300 ms hangover.
    expect(flushed[0]!.samples.length).toBe(90 * SELF_FRAME_SAMPLES);
    expect(flushed[0]!.startSample).toBe(0);
    expect(flushed[0]!.speechFrames).toBe(75);
  });

  it('flushes a long monologue every 10 seconds at most', () => {
    const { chunks } = run([[loud, 1250]]);
    expect(chunks.map((chunk) => chunk.samples.length)).toEqual([
      SELF_CHUNK_MAX_SAMPLES,
      SELF_CHUNK_MAX_SAMPLES,
    ]);
    expect(chunks.map((chunk) => chunk.startSample)).toEqual([0, 160_000]);
  });

  it('drops a chunk with under one second of speech', () => {
    const short = run([
      [loud, 49],
      [quiet, 200],
    ]);
    expect(short.chunks).toHaveLength(0);
    expect(short.chunker.dropped).toBe(1);
    const enough = run([
      [loud, 50],
      [quiet, 200],
    ]);
    expect(enough.chunks).toHaveLength(1);
  });

  it('keeps the sample timeline across a muted gap', () => {
    const { chunker, chunks } = run([
      [loud, 75],
      [quiet, 250],
      [loud, 75],
      [quiet, 200],
    ]);
    expect(chunks).toHaveLength(2);
    // The second chunk begins after the 5 s gap, with 100 ms of pre-roll.
    expect(chunks[1]!.startSample).toBe((325 - 5) * SELF_FRAME_SAMPLES);
    expect(chunker.timeline).toBe(600 * SELF_FRAME_SAMPLES);
  });

  it('rejects frames that are not 20 ms', () => {
    const chunker = new SelfChunker(() => undefined);
    expect(() => chunker.push(new Float32Array(100))).toThrow(RangeError);
  });

  it('discards buffered audio without emitting it', () => {
    const { chunker, chunks } = run([[loud, 80]]);
    chunker.discard();
    chunker.flush();
    expect(chunks).toHaveLength(0);
  });

  it('adapts to steady background noise instead of hearing it as speech', () => {
    const noise = () => new Float32Array(SELF_FRAME_SAMPLES).fill(0.01);
    const { chunks, chunker } = run([[noise, 1000]]);
    expect(chunks).toHaveLength(0);
    expect(chunker.dropped).toBeLessThanOrEqual(1);
  });

  it('still hears speech over that noise', () => {
    const noise = () => new Float32Array(SELF_FRAME_SAMPLES).fill(0.01);
    const { chunks } = run([
      [noise, 300],
      [loud, 75],
      [noise, 200],
    ]);
    expect(chunks).toHaveLength(1);
  });
});

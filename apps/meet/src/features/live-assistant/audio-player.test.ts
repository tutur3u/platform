import { afterEach, expect, it, vi } from 'vitest';
import { LiveAudioPlayer } from './audio';

afterEach(() => vi.unstubAllGlobals());
it('returns an output setup failure through the promise error path', async () => {
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        throw new Error('output unavailable');
      }
    }
  );
  const player = new LiveAudioPlayer();
  let opening: Promise<void> | undefined;
  expect(() => {
    opening = player.unlock();
  }).not.toThrow();
  await expect(opening).rejects.toThrow('output unavailable');
});

function audioHarness() {
  const sources: Array<{
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onended?: () => void;
  }> = [];
  const context = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createBuffer: (_channels: number, length: number, rate: number) => ({
      duration: length / rate,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => {
      const source = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: undefined as (() => void) | undefined,
      };
      sources.push(source);
      return source;
    },
  };
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        // biome-ignore lint/correctness/noConstructorReturn: Web Audio test constructor returns a controlled clock.
        return context;
      }
    }
  );
  return { context, sources, chunk: btoa('\0'.repeat(24000 * 2)) };
}

it('plays a burst longer than three seconds continuously without dropping words', async () => {
  const { sources, chunk } = audioHarness();
  const player = new LiveAudioPlayer();
  await player.unlock();
  for (let index = 0; index < 12; index++) player.play(chunk);
  expect(sources).toHaveLength(12);
  sources.forEach((source, index) => {
    expect(source.start).toHaveBeenCalledWith(index + 0.08);
    expect(source.stop).not.toHaveBeenCalled();
  });
  player.interrupt();
  sources.forEach((source) => {
    expect(source.stop).toHaveBeenCalledOnce();
  });
});

it('reschedules after an underrun and releases completed audio nodes', async () => {
  const { sources, context, chunk } = audioHarness();
  const player = new LiveAudioPlayer();
  await player.unlock();
  player.play(chunk);
  sources[0]?.onended?.();
  expect(sources[0]?.disconnect).toHaveBeenCalledOnce();
  context.currentTime = 5;
  player.play(chunk);
  expect(sources[1]?.start).toHaveBeenCalledWith(5.08);
  player.close();
  expect(sources[0]?.stop).not.toHaveBeenCalled();
  expect(sources[1]?.stop).toHaveBeenCalledOnce();
});

it('bounds the scheduled end without stopping the sentence already queued', async () => {
  const { sources, chunk } = audioHarness();
  const player = new LiveAudioPlayer();
  await player.unlock();
  for (let index = 0; index < 122; index++) player.play(chunk);
  expect(sources).toHaveLength(119);
  expect(sources.at(-1)?.start).toHaveBeenCalledWith(118.08);
  for (const source of sources) expect(source.stop).not.toHaveBeenCalled();
  player.play(chunk, Number.NaN);
  player.play(chunk, 0);
  expect(sources).toHaveLength(119);
});

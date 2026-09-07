import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeMeetWav, MeetAudioCapture } from './audio';

describe('meeting PCM transport', () => {
  it('encodes a self-contained mono 16 kHz WAV for every chunk', async () => {
    const blob = encodeMeetWav(new Float32Array([0, 1, -1, 2]));
    const bytes = await blob.arrayBuffer();
    const view = new DataView(bytes);
    expect(blob.type).toBe('audio/wav');
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32767);
    expect(view.getInt16(50, true)).toBe(32767);
  });
});

describe('audio final flush', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it.each([true, false])(
    'reports whether buffered audio was acknowledged: %s',
    async (acknowledged) => {
      vi.useFakeTimers();
      let listener: (event: { data: { flushed: boolean } }) => void;
      const context = {
        sampleRate: 16000,
        state: 'running',
        destination: {},
        audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
        createGain: () => ({
          gain: { value: 0 },
          connect: vi.fn(),
          disconnect: vi.fn(),
        }),
        resume: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.stubGlobal(
        'AudioContext',
        class {
          constructor() {
            Object.assign(this, context);
          }
        }
      );
      const node = {
        connect: (value: unknown) => value,
        disconnect: vi.fn(),
        port: {
          onmessage: null,
          addEventListener: (_event: string, callback: typeof listener) => {
            listener = callback;
          },
          postMessage: () => {
            if (acknowledged) listener({ data: { flushed: true } });
          },
        },
      };
      vi.stubGlobal(
        'AudioWorkletNode',
        class {
          constructor() {
            Object.assign(this, node);
          }
        }
      );
      const capture = new MeetAudioCapture(vi.fn());
      await capture.start();
      const stopped = capture.stop();
      await vi.advanceTimersByTimeAsync(1000);
      expect(await stopped).toBe(acknowledged);
      expect(context.close).toHaveBeenCalled();
    }
  );
});

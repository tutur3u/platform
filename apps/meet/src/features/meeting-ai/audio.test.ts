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

describe('participant capture lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  function setup(ack = true) {
    vi.useFakeTimers();
    const nodes: Array<{
      port: {
        onmessage:
          | ((event: {
              data: { samples?: Float32Array; flushed?: boolean };
            }) => void)
          | null;
        postMessage: () => void;
      };
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];
    const context = {
      sampleRate: 16000,
      currentTime: 0,
      state: 'running',
      destination: {},
      audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
      createGain: () => ({
        gain: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      createMediaStreamSource: () => ({
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
    vi.stubGlobal(
      'MediaStream',
      class {
        constructor(private tracks: unknown[]) {}
        getAudioTracks() {
          return this.tracks;
        }
      }
    );
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        constructor() {
          const node: (typeof nodes)[number] = {
            connect: vi.fn(),
            disconnect: vi.fn(),
            port: {
              onmessage: null,
              postMessage: () => {
                if (ack) {
                  node.port.onmessage?.({
                    data: { samples: new Float32Array([0.5]) },
                  });
                  node.port.onmessage?.({ data: { flushed: true } });
                }
              },
            },
          };
          nodes.push(node);
          Object.assign(this, node);
        }
      }
    );
    const stream = (id: string) =>
      new MediaStream([
        {
          id,
          readyState: 'live',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        } as unknown as MediaStreamTrack,
      ]);
    return { nodes, stream, context };
  }
  it('keeps simultaneous sources separate and flushes their final audio on stop', async () => {
    const { nodes, stream, context } = setup();
    const chunk = vi.fn();
    const capture = new MeetAudioCapture(chunk);
    await capture.start();
    const a = {
      stream: stream('a'),
      accountId: 'alice',
      kind: 'microphone' as const,
    };
    const b = {
      stream: stream('b'),
      accountId: 'bob',
      kind: 'shared_audio' as const,
    };
    capture.update([a, b]);
    nodes[0]!.port.onmessage?.({
      data: { samples: new Float32Array(16000).fill(0.1) },
    });
    nodes[1]!.port.onmessage?.({
      data: { samples: new Float32Array(16000).fill(0.2) },
    });
    expect(chunk.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      [0, { accountId: 'alice', kind: 'microphone' }],
      [0, { accountId: 'bob', kind: 'shared_audio' }],
    ]);
    capture.update([a, b]);
    expect(nodes).toHaveLength(2);
    expect(await capture.stop()).toBe(true);
    expect(chunk).toHaveBeenCalledTimes(4);
    expect(context.close).toHaveBeenCalled();
  });
  it('remembers an earlier removal flush timeout and disables callbacks after disposal', async () => {
    const { nodes, stream } = setup(false);
    const chunk = vi.fn();
    const capture = new MeetAudioCapture(chunk);
    await capture.start();
    capture.update([{ stream: stream('a'), kind: 'microphone' }]);
    capture.update([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await capture.stop()).toBe(false);
    expect(nodes[0]!.port.onmessage).toBeNull();
    expect(chunk).not.toHaveBeenCalled();
  });
  it('does not upload buffered audio after an unmount disposal', async () => {
    const { nodes, stream } = setup(false);
    const capture = new MeetAudioCapture(vi.fn());
    await capture.start();
    capture.update([{ stream: stream('a'), kind: 'microphone' }]);
    capture.update([]);
    capture.dispose();
    expect(nodes[0]!.port.onmessage).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
  });
});

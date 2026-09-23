import { afterEach, expect, it, vi } from 'vitest';
import { captureLiveAudio } from './audio';

afterEach(() => vi.unstubAllGlobals());
it('flushes the final frame before ending input only when the last included microphone is removed', async () => {
  const events: string[] = [];
  const node = { connect: vi.fn().mockReturnThis(), disconnect: vi.fn() };
  const port = {
    postMessage: vi.fn(),
    onmessage: null as null | ((event: { data: ArrayBuffer | string }) => void),
  };
  vi.stubGlobal(
    'AudioContext',
    class {
      sampleRate = 16000;
      audioWorklet = { addModule: async () => {} };
      destination = {};
      createGain = () => ({ ...node, gain: { value: 1 } });
      createMediaStreamSource = () => node;
      resume = async () => {};
      close = async () => {};
    }
  );
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      port = port;
      connect = node.connect;
      disconnect = node.disconnect;
    }
  );
  const track = () => ({
    readyState: 'live',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const first = track(),
    second = track();
  class Stream {
    constructor(private tracks: ReturnType<typeof track>[]) {}
    getAudioTracks() {
      return this.tracks;
    }
  }
  vi.stubGlobal('MediaStream', Stream);
  const stream = (tracks: ReturnType<typeof track>[]) =>
    new Stream(tracks) as unknown as MediaStream;
  const capture = await captureLiveAudio(
    [stream([first, second])],
    () => events.push('audio'),
    undefined,
    () => events.push('end')
  );
  capture.update([stream([second])]);
  expect(port.postMessage).not.toHaveBeenCalled();
  capture.update([]);
  expect(port.postMessage).toHaveBeenCalledWith('flush');
  port.onmessage?.({ data: new Uint8Array([0, 1]).buffer });
  port.onmessage?.({ data: 'flushed' });
  expect(events).toEqual(['audio', 'end']);
  capture.update([]);
  expect(port.postMessage).toHaveBeenCalledTimes(1);
  capture.update([stream([first])]);
  port.onmessage?.({ data: new Uint8Array([0, 1]).buffer });
  expect(events).toEqual(['audio', 'end', 'audio']);
  const disposing = capture.dispose();
  port.onmessage?.({ data: 'flushed' });
  await disposing;
});

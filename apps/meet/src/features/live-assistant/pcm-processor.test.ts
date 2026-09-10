import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

it('flushes a partial final voice frame before acknowledging shutdown', () => {
  const messages: unknown[] = [];
  let Processor: new () => {
    process(inputs: Float32Array[][]): boolean;
    port: { onmessage: (event: { data: string }) => void };
  };
  runInNewContext(
    readFileSync(
      new URL('../../../public/meet-live-processor.js', import.meta.url),
      'utf8'
    ),
    {
      AudioWorkletProcessor: class {
        port = { postMessage: (data: unknown) => messages.push(data) };
      },
      sampleRate: 16000,
      registerProcessor: (_name: string, value: typeof Processor) => {
        Processor = value;
      },
    }
  );
  const processor = new Processor!();
  processor.process([[new Float32Array([0.5, -0.5])]]);
  expect(messages).toHaveLength(0);
  processor.port.onmessage({ data: 'flush' });
  expect(Array.from(new Int16Array(messages[0] as ArrayBuffer))).toEqual([
    16383, -16384,
  ]);
  expect(messages[1]).toBe('flushed');
  processor.port.onmessage({ data: 'flush' });
  expect(messages).toHaveLength(3);
});

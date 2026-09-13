import { expect, spyOn, test } from 'bun:test';
import { createMeetRealtimeServer } from './server';

test('stopping a local server clears its presence and cleanup sweep', async () => {
  const clear = spyOn(globalThis, 'clearInterval');
  const server = createMeetRealtimeServer({ port: 0 });
  try {
    const response = await fetch(`http://localhost:${server.port}/health`);
    expect(await response.json()).toEqual({ ok: true });
    await server.stop(true);
    expect(clear).toHaveBeenCalledTimes(1);
  } finally {
    await server.stop(true);
    clear.mockRestore();
  }
});

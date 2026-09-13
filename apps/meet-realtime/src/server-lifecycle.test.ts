import { expect, spyOn, test } from 'bun:test';
import { createMeetRealtimeServer } from './server';

test('stopping a local server cancels its scheduled sweep timer', async () => {
  const schedule = spyOn(globalThis, 'setInterval');
  const clear = spyOn(globalThis, 'clearInterval');
  const server = createMeetRealtimeServer({ port: 0 });
  try {
    const response = await fetch(`http://localhost:${server.port}/health`);
    expect(await response.json()).toEqual({ ok: true });
    await server.stop(true);
    const sweepTimer = schedule.mock.results[0]?.value;
    expect(sweepTimer).toBeDefined();
    expect(clear).toHaveBeenCalledWith(sweepTimer);
  } finally {
    await server.stop(true);
    clear.mockRestore();
    schedule.mockRestore();
  }
});

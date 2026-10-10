import { expect, it, vi } from 'vite-plus/test';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(public ctx: unknown) {}
  },
}));
const { RunnerWake } = await import('./wake');
const notify = () => new Request('https://wake.invalid/', { method: 'POST' });

it('counts complete fanout again after duplicate notifications and reconstruction', async () => {
  const send = vi.fn();
  const put = vi.fn();
  const setAlarm = vi.fn();
  const sockets = Array.from({ length: 4096 }, () => ({ send }));
  const context = { getWebSockets: () => sockets, storage: { put, setAlarm } };
  for (let attempt = 0; attempt < 24; attempt++) {
    const wake = new RunnerWake(context as never, {});
    expect((await wake.fetch(notify())).status).toBe(204);
  }
  expect(send).toHaveBeenCalledTimes(98_304);
  expect(put).not.toHaveBeenCalled();
  expect(setAlarm).not.toHaveBeenCalled();
});

it('closes failed sockets while continuing notification delivery', async () => {
  const send = vi.fn(() => {
    throw new Error('send failed');
  });
  const close = vi.fn();
  const wake = new RunnerWake(
    {
      getWebSockets: () => Array.from({ length: 128 }, () => ({ send, close })),
    } as never,
    {}
  );
  expect((await wake.fetch(notify())).status).toBe(204);
  expect(send).toHaveBeenCalledTimes(128);
  expect(close).toHaveBeenCalledTimes(128);
});

it('reports a close failure instead of acknowledging incomplete fanout', async () => {
  const later = vi.fn();
  const wake = new RunnerWake(
    {
      getWebSockets: () => [
        {
          send: () => {
            throw new Error('send');
          },
          close: () => {
            throw new Error('close');
          },
        },
        { send: later },
      ],
    } as never,
    {}
  );
  await expect(wake.fetch(notify())).rejects.toThrow('close');
  expect(later).not.toHaveBeenCalled();
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firstPage } from './queries';

const page = { machineId: 'm4', threads: [], nextCursor: null, total: 0 };

describe('cache writes across tabs', () => {
  beforeEach(() => localStorage.clear());

  it('erases its own write when another tab erased while it was writing', async () => {
    const clear = vi.fn(async () => undefined);
    // The other tab moves the shared epoch while this write is in flight.
    const write = vi.fn(async () => {
      localStorage.setItem('mastermind-projects:erase-epoch', '1');
    });
    const store = {
      cache: { write, read: vi.fn(async () => null), clear } as never,
      ownerId: 'o',
      machineId: 'm4',
    };
    await firstPage({ state: 'all' }, async () => page as never, store);
    await vi.waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
  });

  it('writes nothing when another tab erased before the read finished', async () => {
    const write = vi.fn(async () => undefined);
    const store = {
      cache: { write, read: vi.fn(async () => null), clear: vi.fn() } as never,
      ownerId: 'o',
      machineId: 'm4',
    };
    await firstPage(
      { state: 'all' },
      async () => {
        localStorage.setItem('mastermind-projects:erase-epoch', '2');
        return page as never;
      },
      store
    );
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps a write when no tab erased', async () => {
    const write = vi.fn(async () => undefined);
    const clear = vi.fn();
    const store = {
      cache: { write, read: vi.fn(async () => null), clear } as never,
      ownerId: 'o',
      machineId: 'm4',
    };
    await firstPage({ state: 'all' }, async () => page as never, store);
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(clear).not.toHaveBeenCalled();
  });
});

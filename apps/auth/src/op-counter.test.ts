import { describe, expect, it, vi } from 'vite-plus/test';
import { createOpCounter, OP_FLUSH_INTERVAL_MS } from './op-counter';

describe('isolate operation counter', () => {
  it('flushes at most once per minute and never throws on failure', async () => {
    let now = 0;
    const flush = vi.fn(async () => {
      throw new Error('budget down');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const counter = createOpCounter({ now: () => now, flush });
    counter.record('control');
    counter.record('control');
    expect(counter.maybeFlush()).toBeNull();
    now = OP_FLUSH_INTERVAL_MS;
    await counter.maybeFlush();
    expect(flush).toHaveBeenCalledWith({ control: 2 });
    expect(counter.droppedFlushes()).toBe(1);
    expect(counter.pending()).toEqual({});
    counter.record('keys');
    now += OP_FLUSH_INTERVAL_MS - 1;
    expect(counter.maybeFlush()).toBeNull();
  });

  it('skips the call when nothing was counted', () => {
    const flush = vi.fn(async () => {});
    const counter = createOpCounter({
      now: () => OP_FLUSH_INTERVAL_MS * 2,
      flush,
    });
    expect(counter.maybeFlush()).toBeNull();
    expect(flush).not.toHaveBeenCalled();
  });
});

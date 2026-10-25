import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyWithAutoClear } from './clipboard';

function fakeClipboard(initial = '') {
  const state = { value: initial, denyRead: false };
  return {
    state,
    writeText: async (text: string) => {
      state.value = text;
    },
    readText: async () => {
      if (state.denyRead) throw new Error('denied');
      return state.value;
    },
  };
}

describe('copyWithAutoClear', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('clears the clipboard when it still holds the copied value', async () => {
    const clipboard = fakeClipboard();
    const onSettled = vi.fn();
    await copyWithAutoClear('s3cret', { clipboard, delayMs: 100, onSettled });
    expect(clipboard.state.value).toBe('s3cret');
    await vi.advanceTimersByTimeAsync(100);
    expect(clipboard.state.value).toBe('');
    expect(onSettled).toHaveBeenCalledWith('cleared');
  });

  it('leaves a value another writer placed on the clipboard', async () => {
    const clipboard = fakeClipboard();
    const onSettled = vi.fn();
    await copyWithAutoClear('s3cret', { clipboard, delayMs: 100, onSettled });
    clipboard.state.value = 'something else';
    await vi.advanceTimersByTimeAsync(100);
    expect(clipboard.state.value).toBe('something else');
    expect(onSettled).toHaveBeenCalledWith('changed');
  });

  it('reports unverifiable instead of clearing blindly when reading is denied', async () => {
    const clipboard = fakeClipboard();
    const onSettled = vi.fn();
    await copyWithAutoClear('s3cret', { clipboard, delayMs: 100, onSettled });
    clipboard.state.denyRead = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(clipboard.state.value).toBe('s3cret');
    expect(onSettled).toHaveBeenCalledWith('unverifiable');
  });
});

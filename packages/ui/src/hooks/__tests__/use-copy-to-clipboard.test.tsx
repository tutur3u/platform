import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCopyToClipboard } from '../use-copy-to-clipboard';

class ClipboardItemMock {
  constructor(public readonly items: Record<string, Blob>) {}
}

describe('useCopyToClipboard', () => {
  const write = vi.fn();
  const writeText = vi.fn();
  const originalClipboard = Object.getOwnPropertyDescriptor(
    navigator,
    'clipboard'
  );

  function setClipboard(value: unknown) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ClipboardItem', ClipboardItemMock);
    write.mockReset().mockResolvedValue(undefined);
    writeText.mockReset().mockResolvedValue(undefined);
    setClipboard({ write, writeText });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  it('writes a text/plain ClipboardItem and resets after the timeout', async () => {
    const { result } = renderHook(() => useCopyToClipboard({ timeout: 500 }));

    expect(result.current.isCopied).toBe(false);

    await act(async () => {
      await result.current.copyToClipboard('hello');
    });

    expect(write).toHaveBeenCalledTimes(1);
    const [items] = write.mock.calls[0] as [ClipboardItemMock[]];
    expect(items[0]).toBeInstanceOf(ClipboardItemMock);
    const blob = items[0]?.items['text/plain'];
    expect(blob?.type).toBe('text/plain');
    expect(await blob?.text()).toBe('hello');
    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.isCopied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current.isCopied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isCopied).toBe(false);
  });

  it('uses a 2000ms default timeout', async () => {
    const { result } = renderHook(() => useCopyToClipboard({}));

    await act(async () => {
      await result.current.copyToClipboard('hello');
    });

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(result.current.isCopied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.isCopied).toBe(false);
  });

  it('ignores empty values', async () => {
    const { result } = renderHook(() => useCopyToClipboard({}));

    await act(async () => {
      await result.current.copyToClipboard('');
    });

    expect(write).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.isCopied).toBe(false);
  });

  it('does nothing when the clipboard API is unavailable', async () => {
    setClipboard(undefined);
    const { result } = renderHook(() => useCopyToClipboard({}));

    await act(async () => {
      await result.current.copyToClipboard('hello');
    });

    expect(result.current.isCopied).toBe(false);
  });

  it('falls back to writeText when write fails', async () => {
    write.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useCopyToClipboard({ timeout: 100 }));

    await act(async () => {
      await result.current.copyToClipboard('fallback');
    });

    expect(writeText).toHaveBeenCalledWith('fallback');
    expect(result.current.isCopied).toBe(true);
    expect(console.error).toHaveBeenCalledWith(
      'Failed to copy:',
      expect.any(Error)
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.isCopied).toBe(false);
  });

  it('stays not-copied when both clipboard writes fail', async () => {
    write.mockRejectedValue(new Error('denied'));
    writeText.mockRejectedValue(new Error('also denied'));
    const { result } = renderHook(() => useCopyToClipboard({}));

    await act(async () => {
      await result.current.copyToClipboard('nope');
    });

    expect(result.current.isCopied).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      'Failed to copy text:',
      expect.any(Error)
    );
  });
});

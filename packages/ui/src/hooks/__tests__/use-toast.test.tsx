import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reducer, toast, useToast } from '../use-toast';

type ReducerState = Parameters<typeof reducer>[0];

function makeState(ids: string[]): ReducerState {
  return { toasts: ids.map((id) => ({ id, open: true, title: id })) };
}

describe('use-toast reducer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ADD_TOAST prepends the toast and keeps only the newest one', () => {
    const state = reducer(makeState(['a']), {
      type: 'ADD_TOAST',
      toast: { id: 'b', title: 'b' },
    });

    expect(state.toasts.map((t) => t.id)).toEqual(['b']);
  });

  it('UPDATE_TOAST merges fields into the matching toast only', () => {
    const initial = makeState(['a']);
    const state = reducer(initial, {
      type: 'UPDATE_TOAST',
      toast: { id: 'a', title: 'updated' },
    });

    expect(state.toasts[0]).toEqual({ id: 'a', open: true, title: 'updated' });
    expect(initial.toasts[0]?.title).toBe('a');

    const unchanged = reducer(initial, {
      type: 'UPDATE_TOAST',
      toast: { id: 'missing', title: 'x' },
    });
    expect(unchanged.toasts).toEqual(initial.toasts);
  });

  it('DISMISS_TOAST with an id closes only that toast', () => {
    const state = reducer(
      { toasts: [...makeState(['r1']).toasts, ...makeState(['r2']).toasts] },
      { type: 'DISMISS_TOAST', toastId: 'r1' }
    );

    expect(state.toasts).toEqual([
      { id: 'r1', open: false, title: 'r1' },
      { id: 'r2', open: true, title: 'r2' },
    ]);
  });

  it('DISMISS_TOAST without an id closes every toast', () => {
    const state = reducer(
      { toasts: [...makeState(['r3']).toasts, ...makeState(['r4']).toasts] },
      { type: 'DISMISS_TOAST' }
    );

    expect(state.toasts.every((t) => t.open === false)).toBe(true);
  });

  it('REMOVE_TOAST with an id drops that toast', () => {
    const state = reducer(
      { toasts: [...makeState(['a']).toasts, ...makeState(['b']).toasts] },
      { type: 'REMOVE_TOAST', toastId: 'a' }
    );

    expect(state.toasts.map((t) => t.id)).toEqual(['b']);
  });

  it('REMOVE_TOAST without an id clears all toasts', () => {
    const state = reducer(makeState(['a', 'b']), { type: 'REMOVE_TOAST' });

    expect(state.toasts).toEqual([]);
  });
});

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows, updates, dismisses and finally removes a toast', () => {
    const { result } = renderHook(() => useToast());

    let handle!: ReturnType<typeof toast>;
    act(() => {
      handle = result.current.toast({ title: 'Saved' });
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      id: handle.id,
      title: 'Saved',
      open: true,
    });

    act(() => {
      handle.update({ id: handle.id, title: 'Saved again' });
    });
    expect(result.current.toasts[0]?.title).toBe('Saved again');

    act(() => {
      result.current.toasts[0]?.onOpenChange?.(false);
    });
    expect(result.current.toasts[0]?.open).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1_000_000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('keeps only the newest toast and dismisses all via dismiss()', () => {
    const { result } = renderHook(() => useToast());

    let second!: ReturnType<typeof toast>;
    act(() => {
      toast({ title: 'first' });
      second = toast({ title: 'second' });
    });

    expect(result.current.toasts.map((t) => t.id)).toEqual([second.id]);

    act(() => {
      result.current.toasts[0]?.onOpenChange?.(true);
    });
    expect(result.current.toasts[0]?.open).toBe(true);

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.toasts[0]?.open).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1_000_000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('shares state between subscribers and unsubscribes on unmount', () => {
    const first = renderHook(() => useToast());
    const second = renderHook(() => useToast());

    act(() => {
      toast({ title: 'shared' });
    });
    expect(second.result.current.toasts[0]?.title).toBe('shared');

    first.unmount();

    act(() => {
      second.result.current.dismiss();
      vi.advanceTimersByTime(1_000_000);
    });
    expect(second.result.current.toasts).toHaveLength(0);
    second.unmount();
  });
});

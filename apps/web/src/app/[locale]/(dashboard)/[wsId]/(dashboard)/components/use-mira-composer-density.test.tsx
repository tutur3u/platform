import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPOSER_IDLE_MS,
  useMiraComposerDensity,
} from './use-mira-composer-density';

afterEach(() => vi.useRealTimers());

describe('composer density', () => {
  it('compacts after inactivity and reopens on request', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useMiraComposerDensity({ enabled: true, protectedContent: false })
    );
    act(() => vi.advanceTimersByTime(COMPOSER_IDLE_MS - 1));
    expect(result.current.compact).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.compact).toBe(true);
    act(() => result.current.expand());
    expect(result.current.compact).toBe(false);
  });

  it('keeps focused controls and drafts expanded', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ protectedContent }) =>
        useMiraComposerDensity({ enabled: true, protectedContent }),
      { initialProps: { protectedContent: false } }
    );
    act(() => result.current.onFocus());
    act(() => vi.advanceTimersByTime(COMPOSER_IDLE_MS * 2));
    expect(result.current.compact).toBe(false);
    act(() => result.current.onBlur());
    rerender({ protectedContent: true });
    act(() => vi.advanceTimersByTime(COMPOSER_IDLE_MS * 2));
    expect(result.current.compact).toBe(false);
  });

  it('compacts on downward scrolling without waiting for the idle timer', () => {
    const node = document.createElement('div');
    const { result } = renderHook(() =>
      useMiraComposerDensity({
        enabled: true,
        protectedContent: false,
        scrollContainerRef: { current: node },
      })
    );
    act(() => {
      node.scrollTop = 20;
      node.dispatchEvent(new Event('scroll'));
    });
    expect(result.current.compact).toBe(true);
  });
});

it('returns expanded after leaving Live even when entered from the compact bar', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(
    ({ enabled }) =>
      useMiraComposerDensity({ enabled, protectedContent: false }),
    { initialProps: { enabled: true } }
  );
  act(() => vi.advanceTimersByTime(COMPOSER_IDLE_MS));
  expect(result.current.compact).toBe(true);
  rerender({ enabled: false });
  rerender({ enabled: true });
  expect(result.current.compact).toBe(false);
});

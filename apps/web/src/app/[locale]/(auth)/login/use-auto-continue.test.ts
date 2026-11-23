// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoContinue } from './use-auto-continue';

describe('useAutoContinue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(eligible = true) {
    const onContinue = vi.fn();
    const hook = renderHook(
      ({ eligible: current }) =>
        useAutoContinue({ delayMs: 1000, eligible: current, onContinue }),
      { initialProps: { eligible } }
    );
    return { hook, onContinue };
  }

  it('continues once after the delay', () => {
    const { hook, onContinue } = setup();
    act(() => vi.advanceTimersByTime(1000));
    expect(onContinue).toHaveBeenCalledTimes(1);
    hook.rerender({ eligible: true });
    expect(hook.result.current.counting).toBe(false);
    act(() => vi.advanceTimersByTime(5000));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('never continues when not eligible', () => {
    const { onContinue } = setup(false);
    act(() => vi.advanceTimersByTime(5000));
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('keeps holding on focus after the pointer leaves', () => {
    const { hook, onContinue } = setup();
    act(() => hook.result.current.holdHandlers.onFocus());
    act(() => hook.result.current.holdHandlers.onPointerEnter());
    act(() => hook.result.current.holdHandlers.onPointerLeave());
    act(() => vi.advanceTimersByTime(3000));
    expect(onContinue).not.toHaveBeenCalled();

    act(() => hook.result.current.holdHandlers.onBlur());
    act(() => vi.advanceTimersByTime(1000));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('clears a hold when the countdown stops, so it never sticks', () => {
    const { hook, onContinue } = setup();
    act(() => hook.result.current.holdHandlers.onPointerEnter());
    hook.rerender({ eligible: false });
    hook.rerender({ eligible: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('stops for good on cancel', () => {
    const { hook, onContinue } = setup();
    act(() => hook.result.current.cancel());
    hook.rerender({ eligible: false });
    hook.rerender({ eligible: true });
    act(() => vi.advanceTimersByTime(5000));
    expect(onContinue).not.toHaveBeenCalled();
    expect(hook.result.current.counting).toBe(false);
  });
});

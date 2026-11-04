// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSettleMotion, useSettlingSpin } from './use-settling-spin';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(reducedMotion = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: reducedMotion }))
  );
  const spin = { cancel: vi.fn(), currentTime: 200 };
  const element = {
    animate: vi.fn(
      (_frames: Keyframe[], _options: KeyframeAnimationOptions) => spin
    ),
    getAnimations: vi.fn(() => []),
  };
  const ref = { current: element as unknown as Element };
  const hook = renderHook(({ active }) => useSettlingSpin(ref, active), {
    initialProps: { active: false },
  });
  return { element, hook, spin };
}

describe('getSettleMotion', () => {
  it('always comes to rest on a whole turn', () => {
    for (const angle of [0, 45, 180, 300, 359, 725]) {
      const { distance } = getSettleMotion(angle);
      expect((angle + distance) % 360).toBe(0);
      expect(distance).toBeGreaterThanOrEqual(90);
    }
  });

  it('keeps the ease-out within a short, bounded duration', () => {
    expect(getSettleMotion(0).duration).toBeLessThanOrEqual(1000);
    expect(getSettleMotion(200).duration).toBeGreaterThanOrEqual(350);
  });
});

describe('useSettlingSpin', () => {
  it('spins while active, then eases back from the current angle', () => {
    const { element, hook, spin } = setup();
    hook.rerender({ active: true });
    expect(element.animate).toHaveBeenCalledTimes(1);
    expect(element.animate.mock.calls[0]?.[1]).toMatchObject({
      iterations: Infinity,
    });

    // Re-rendering while still busy keeps the same continuous spin.
    hook.rerender({ active: true });
    expect(element.animate).toHaveBeenCalledTimes(1);

    hook.rerender({ active: false });
    expect(spin.cancel).toHaveBeenCalled();
    const [frames, options] = element.animate.mock.calls[1] ?? [];
    // 200ms into an 800ms turn is 90 degrees.
    expect(frames?.[0]?.transform).toBe('rotate(90deg)');
    expect(frames?.[1]?.transform).toBe('rotate(360deg)');
    expect(options?.iterations).toBeUndefined();
  });

  it('does not rotate for reduced-motion users', () => {
    const { element, hook } = setup(true);
    hook.rerender({ active: true });
    hook.rerender({ active: false });
    expect(element.animate).not.toHaveBeenCalled();
  });
});

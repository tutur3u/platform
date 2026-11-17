import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachDockViewportAnchor,
  DOCK_VIEWPORT_DROP_MAX,
  DOCK_VIEWPORT_DROP_MIN,
  DOCK_VIEWPORT_DROP_PROPERTY,
  DOCK_VIEWPORT_SETTLE_MS,
  measureDockViewportDrop,
} from './dock-viewport-anchor';

class FakeViewport extends EventTarget {
  height = 844;
  offsetTop = 0;
  scale = 1;
}

/** `fixedBottom` is where a `position: fixed; bottom: 0` element ends. */
function setup(fixedBottom = 844) {
  const viewport = new FakeViewport();
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ top: fixedBottom }) as DOMRect
  );
  return {
    viewport,
    setFixedBottom: (value: number) => {
      fixedBottom = value;
    },
  };
}

const published = () =>
  document.documentElement.style.getPropertyValue(DOCK_VIEWPORT_DROP_PROPERTY);
const probes = () =>
  document.querySelectorAll('[data-slot="mobile-dock-viewport-probe"]');
const settle = () => vi.advanceTimersByTime(DOCK_VIEWPORT_SETTLE_MS);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty(DOCK_VIEWPORT_DROP_PROPERTY);
});

describe('measureDockViewportDrop', () => {
  const probe = document.createElement('div');

  it('is zero while fixed content ends on the visible bottom', () => {
    setup(844);
    expect(measureDockViewportDrop(window, probe)).toBe(0);
  });

  it('is zero when a collapsed toolbar already moved fixed content down', () => {
    const { viewport } = setup(844);
    // The small viewport (clientHeight) stays at 762; fixed content follows
    // the visible edge, so there is nothing to correct.
    viewport.height = 844;
    expect(measureDockViewportDrop(window, probe)).toBe(0);
  });

  it('measures fixed content that ends above the visible bottom', () => {
    const { viewport } = setup(762);
    viewport.height = 844;
    expect(measureDockViewportDrop(window, probe)).toBe(82);
  });

  it('ignores a keyboard, pinch zoom and implausible gaps', () => {
    const { viewport, setFixedBottom } = setup(844);
    viewport.height = 500;
    expect(measureDockViewportDrop(window, probe)).toBe(0);

    viewport.height = 844;
    setFixedBottom(700);
    viewport.scale = 2;
    expect(measureDockViewportDrop(window, probe)).toBe(0);

    viewport.scale = 1;
    setFixedBottom(844 - DOCK_VIEWPORT_DROP_MIN);
    viewport.height = 844.33;
    expect(measureDockViewportDrop(window, probe)).toBe(0);

    viewport.height = 844;
    setFixedBottom(844 - DOCK_VIEWPORT_DROP_MAX - 1);
    expect(measureDockViewportDrop(window, probe)).toBe(0);
  });
});

describe('attachDockViewportAnchor', () => {
  it('re-pins the dock when the page resumes with stale fixed layout', () => {
    const { setFixedBottom } = setup(844);
    const detach = attachDockViewportAnchor(window);
    settle();
    expect(published()).toBe('');

    setFixedBottom(762);
    window.dispatchEvent(new Event('pageshow'));
    settle();
    expect(published()).toBe('82px');

    setFixedBottom(844);
    document.dispatchEvent(new Event('visibilitychange'));
    settle();
    expect(published()).toBe('');

    detach();
  });

  it('shares one tracker between docks until the last one detaches', () => {
    const { viewport, setFixedBottom } = setup(800);
    const first = attachDockViewportAnchor(window);
    const second = attachDockViewportAnchor(window);
    settle();
    expect(published()).toBe('44px');
    expect(probes()).toHaveLength(1);

    first();
    first();
    expect(published()).toBe('44px');

    second();
    expect(published()).toBe('');
    expect(probes()).toHaveLength(0);
    setFixedBottom(780);
    viewport.dispatchEvent(new Event('resize'));
    settle();
    expect(published()).toBe('');
  });
});

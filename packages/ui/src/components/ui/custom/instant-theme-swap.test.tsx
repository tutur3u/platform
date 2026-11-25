import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installInstantThemeSwap,
  suppressThemeTransitions,
} from './instant-theme-swap';

const flushMutations = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('suppressThemeTransitions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('flushes styles with transitions disabled and leaves no rule behind', () => {
    const seenRules: string[] = [];
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => {
      seenRules.push(
        document.querySelector('style[data-instant-theme-swap]')?.textContent ??
          ''
      );
      return { color: '' } as CSSStyleDeclaration;
    });

    suppressThemeTransitions(document);

    expect(seenRules).toHaveLength(1);
    expect(seenRules[0]).toContain('transition:none!important');
    expect(document.querySelector('style[data-instant-theme-swap]')).toBeNull();
  });

  it('finishes color transitions that already started', () => {
    const color = { transitionProperty: 'background-color', finish: vi.fn() };
    const transform = { transitionProperty: 'transform', finish: vi.fn() };
    Object.defineProperty(document, 'getAnimations', {
      configurable: true,
      value: () => [color, transform],
    });

    try {
      suppressThemeTransitions(document);

      expect(color.finish).toHaveBeenCalledOnce();
      expect(transform.finish).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(document, 'getAnimations');
    }
  });

  it('carries the CSP nonce on the injected rule', () => {
    const nonces: string[] = [];
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => {
      const style = document.querySelector<HTMLStyleElement>(
        'style[data-instant-theme-swap]'
      );
      nonces.push(style?.nonce ?? '');
      return { color: '' } as CSSStyleDeclaration;
    });

    suppressThemeTransitions(document, 'request-nonce');

    expect(nonces).toEqual(['request-nonce']);
  });
});

describe('installInstantThemeSwap', () => {
  afterEach(() => {
    document.documentElement.className = '';
  });

  it('suppresses transitions only when the light/dark class changes', async () => {
    const root = document.documentElement;
    root.className = 'light';
    const appendChild = vi.spyOn(document.head, 'appendChild');
    const dispose = installInstantThemeSwap(root);

    root.classList.add('sidebar-open');
    await flushMutations();
    expect(appendChild).not.toHaveBeenCalled();

    // next-themes removes both classes, then adds the new one.
    root.classList.remove('light', 'dark');
    root.classList.add('dark');
    await flushMutations();
    expect(appendChild).toHaveBeenCalledOnce();

    dispose();
    root.classList.replace('dark', 'light');
    await flushMutations();
    expect(appendChild).toHaveBeenCalledOnce();
    appendChild.mockRestore();
  });
});

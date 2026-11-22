// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SorbetRouteScope } from './sorbet-route-scope';
import { SORBET_UI_STORAGE_KEY } from './sorbet-ui';

const root = () => document.documentElement;

afterEach(() => {
  localStorage.clear();
  root().removeAttribute('data-ui');
});

describe('SorbetRouteScope', () => {
  it('applies Sorbet on a device that opted out without storing a choice', async () => {
    localStorage.setItem(SORBET_UI_STORAGE_KEY, 'false');
    const { unmount } = render(<SorbetRouteScope />);
    expect(root().getAttribute('data-ui')).toBe('sorbet');

    // An account sync that removes it does not repaint the scoped route.
    root().removeAttribute('data-ui');
    await Promise.resolve();
    expect(root().getAttribute('data-ui')).toBe('sorbet');
    expect(localStorage.getItem(SORBET_UI_STORAGE_KEY)).toBe('false');

    unmount();
    expect(root().hasAttribute('data-ui')).toBe(false);
  });

  it('leaves Sorbet on after unmount for a device that keeps it', () => {
    const { unmount } = render(<SorbetRouteScope />);
    expect(root().getAttribute('data-ui')).toBe('sorbet');
    unmount();
    expect(root().getAttribute('data-ui')).toBe('sorbet');
    expect(localStorage.getItem(SORBET_UI_STORAGE_KEY)).toBeNull();
  });
});

// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ToolbarAction } from './toolbar-action.js';

describe('toolbar action selection safety', () => {
  it('runs once before pointer focus and remains keyboard accessible', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const run = vi.fn();

    act(() => {
      root.render(
        <ToolbarAction icon={() => <svg />} label="Toggle section" run={run} />
      );
    });
    const button = container.querySelector('button');
    expect(button).not.toBeNull();

    const pointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    button?.dispatchEvent(pointerDown);
    button?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1 })
    );
    expect(pointerDown.defaultPrevented).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);

    button?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 0 })
    );
    expect(run).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });
});

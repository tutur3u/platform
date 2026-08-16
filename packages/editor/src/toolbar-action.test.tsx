// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToolbarAction } from './toolbar-action.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('toolbar action selection safety', () => {
  it('runs once for primary pointers and completed keyboard or touch clicks', () => {
    const run = vi.fn();
    const { getByRole } = render(
      <ToolbarAction icon={() => <svg />} label="Toggle section" run={run} />
    );
    const button = getByRole('button', { name: 'Toggle section' });

    fireEvent.pointerDown(button, { button: 0, pointerType: 'mouse' });
    fireEvent.click(button);
    expect(run).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(button, { button: 2, pointerType: 'mouse' });
    expect(run).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(button, { button: 0, pointerType: 'touch' });
    fireEvent.click(button);
    expect(run).toHaveBeenCalledTimes(2);

    fireEvent.click(button);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('does not let an abandoned pointer gesture swallow the next click', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const { getByRole } = render(
      <ToolbarAction icon={() => <svg />} label="Toggle section" run={run} />
    );
    const button = getByRole('button', { name: 'Toggle section' });

    fireEvent.pointerDown(button, { button: 0, pointerType: 'mouse' });
    expect(run).toHaveBeenCalledTimes(1);
    vi.runAllTimers();

    fireEvent.click(button);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

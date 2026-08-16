import { describe, expect, it, vi } from 'vitest';
import { ToolbarAction } from './toolbar-action.js';

describe('toolbar action selection safety', () => {
  it('runs once for primary pointers and completed keyboard or touch clicks', () => {
    const run = vi.fn();
    const tree = ToolbarAction({
      icon: () => <svg />,
      label: 'Toggle section',
      run,
    });
    const button = tree.props.children[0];
    const preventDefault = vi.fn();
    const currentTarget = { dataset: {} };

    button.props.onPointerDown({
      button: 0,
      currentTarget,
      pointerType: 'mouse',
      preventDefault,
    });
    button.props.onClick({ currentTarget, detail: 1 });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledTimes(1);

    button.props.onPointerDown({
      button: 2,
      currentTarget,
      pointerType: 'mouse',
      preventDefault,
    });
    expect(run).toHaveBeenCalledTimes(1);

    button.props.onPointerDown({
      button: 0,
      currentTarget,
      pointerType: 'touch',
      preventDefault,
    });
    button.props.onClick({ currentTarget, detail: 1 });
    expect(run).toHaveBeenCalledTimes(2);

    button.props.onClick({ currentTarget, detail: 0 });
    expect(run).toHaveBeenCalledTimes(3);
  });
});

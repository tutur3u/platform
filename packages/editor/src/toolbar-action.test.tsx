import { describe, expect, it, vi } from 'vitest';
import { ToolbarAction } from './toolbar-action.js';

describe('toolbar action selection safety', () => {
  it('runs once before pointer focus and remains keyboard accessible', () => {
    const run = vi.fn();
    const tree = ToolbarAction({
      icon: () => <svg />,
      label: 'Toggle section',
      run,
    });
    const button = tree.props.children[0];
    const preventDefault = vi.fn();

    button.props.onPointerDown({ preventDefault });
    button.props.onClick({ detail: 1 });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledTimes(1);

    button.props.onClick({ detail: 0 });
    expect(run).toHaveBeenCalledTimes(2);
  });
});

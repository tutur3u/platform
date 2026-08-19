import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  handleTaskOptionShortcut,
  TaskOptionShortcutHint,
} from './task-option-shortcuts';

describe('task option shortcuts', () => {
  it('selects digits before the focused search field consumes them', () => {
    const onSelect = vi.fn(() => true);
    render(
      <input
        aria-label="Search"
        onKeyDownCapture={(event) =>
          handleTaskOptionShortcut(event, true, onSelect)
        }
      />
    );

    const input = screen.getByLabelText('Search');
    fireEvent.keyDown(input, { key: '3' });

    expect(onSelect).toHaveBeenCalledWith(3);
    expect(input).toHaveValue('');
  });

  it('leaves digits alone when quick selection is inactive or unavailable', () => {
    const onSelect = vi.fn(() => false);
    render(
      <input
        aria-label="Search"
        onKeyDownCapture={(event) =>
          handleTaskOptionShortcut(event, false, onSelect)
        }
      />
    );

    fireEvent.keyDown(screen.getByLabelText('Search'), { key: '7' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders a compact key hint only while the keyboard flow is active', () => {
    const { rerender } = render(
      <TaskOptionShortcutHint digit={1} visible={false} />
    );
    expect(screen.queryByText('1')).not.toBeInTheDocument();

    rerender(<TaskOptionShortcutHint digit={1} visible />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});

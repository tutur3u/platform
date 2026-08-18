import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskResourceSearchField } from '../task-resource-search-field';

function SearchHarness({
  onSelect = vi.fn(),
}: {
  onSelect?: (id: string) => void;
}) {
  const [value, setValue] = useState('');

  return (
    <div data-slot="popover-content">
      <TaskResourceSearchField
        value={value}
        onChange={setValue}
        placeholder="Search resources..."
      />
      <button
        data-task-resource-option="true"
        type="button"
        onClick={() => onSelect('first')}
      >
        First
      </button>
      <button
        data-task-resource-option="true"
        type="button"
        onClick={() => onSelect('second')}
      >
        Second
      </button>
    </div>
  );
}

describe('TaskResourceSearchField', () => {
  it('auto-focuses so typing can start as soon as a picker opens', () => {
    render(<SearchHarness />);

    expect(screen.getByPlaceholderText('Search resources...')).toHaveFocus();
  });

  it('moves through options with arrow keys and wraps in both directions', () => {
    render(<SearchHarness />);

    const search = screen.getByPlaceholderText('Search resources...');
    const first = screen.getByRole('button', { name: 'First' });
    const second = screen.getByRole('button', { name: 'Second' });

    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(second).toHaveFocus();

    fireEvent.keyDown(second, { key: 'ArrowDown' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(second).toHaveFocus();
  });

  it('clears an active query on Escape before the surrounding popover closes', () => {
    render(<SearchHarness />);

    const search = screen.getByPlaceholderText('Search resources...');
    fireEvent.change(search, { target: { value: 'urgent' } });
    expect(search).toHaveValue('urgent');

    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
  });
});

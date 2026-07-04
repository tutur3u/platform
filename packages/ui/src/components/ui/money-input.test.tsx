import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MoneyInput } from './money-input';

describe('MoneyInput', () => {
  it('renders a minor-unit USD value as major units', () => {
    render(
      <MoneyInput
        aria-label="Price"
        currency="USD"
        hideHelpers
        onChange={vi.fn()}
        value={10000}
      />
    );

    const input = screen.getByLabelText('Price') as HTMLInputElement;
    expect(input).toHaveValue('100');
  });

  it('emits minor units (cents) for a USD entry', () => {
    const onChange = vi.fn();
    render(
      <MoneyInput
        aria-label="Price"
        currency="USD"
        hideHelpers
        onChange={onChange}
        value={undefined}
      />
    );

    const input = screen.getByLabelText('Price') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, {
      target: { selectionStart: 4, value: '9.99' },
    });

    expect(onChange).toHaveBeenLastCalledWith(999);
  });

  it('treats zero-decimal currencies 1:1', () => {
    const onChange = vi.fn();
    render(
      <MoneyInput
        aria-label="Price"
        currency="VND"
        hideHelpers
        onChange={onChange}
        value={25000}
      />
    );

    const input = screen.getByLabelText('Price') as HTMLInputElement;
    // 25000 minor units == 25000 major units for VND (0 fraction digits).
    expect(input.value.replace(/[^\d]/g, '')).toBe('25000');

    fireEvent.focus(input);
    fireEvent.change(input, {
      target: { selectionStart: 3, value: '500' },
    });
    expect(onChange).toHaveBeenLastCalledWith(500);
  });
});

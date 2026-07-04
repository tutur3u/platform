import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CurrencyInput } from './currency-input';

describe('CurrencyInput', () => {
  it('keeps locale decimal separators while editing', () => {
    const onChange = vi.fn();

    render(
      <CurrencyInput
        aria-label="Amount"
        hideHelpers
        locale="vi-VN"
        maximumFractionDigits={2}
        onChange={onChange}
        value={undefined}
      />
    );

    const input = screen.getByLabelText('Amount') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, {
      target: {
        selectionStart: 3,
        value: '1,2',
      },
    });

    expect(input).toHaveValue('1,2');
    expect(onChange).toHaveBeenLastCalledWith(1.2);

    fireEvent.change(input, {
      target: {
        selectionStart: input.value.length + 1,
        value: `${input.value}3`,
      },
    });

    expect(input).toHaveValue('1,23');
    expect(onChange).toHaveBeenLastCalledWith(1.23);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DatePicker } from './user-date-picker';

describe('DatePicker', () => {
  it('renders the placeholder when no value is set', () => {
    render(<DatePicker />);
    expect(screen.getByText('Pick a date')).toBeDefined();
  });

  it('renders the formatted value and clears it on demand', () => {
    const onValueChange = vi.fn();
    render(
      <DatePicker onValueChange={onValueChange} value={new Date(2026, 0, 15)} />
    );

    expect(screen.getByText('January 15th, 2026')).toBeDefined();

    // The clear affordance is the icon-only button (no textual label).
    const clearButton = screen
      .getAllByRole('button')
      .find((button) => !button.textContent?.includes('January'));
    expect(clearButton).toBeDefined();

    fireEvent.click(clearButton as HTMLElement);

    expect(onValueChange).toHaveBeenCalledWith(undefined);
    expect(screen.getByText('Pick a date')).toBeDefined();
  });
});

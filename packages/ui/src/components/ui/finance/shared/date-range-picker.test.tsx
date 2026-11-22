import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DateRangePicker } from './date-range-picker';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

describe('DateRangePicker', () => {
  it('labels each picker and shapes its trigger as a field', () => {
    render(
      <DateRangePicker
        startLabel="Select start date"
        endLabel="Select end date"
        setStartDate={vi.fn()}
        setEndDate={vi.fn()}
      />
    );

    const start = screen.getByLabelText('Select start date');
    const end = screen.getByLabelText('Select end date');

    for (const trigger of [start, end]) {
      expect(trigger.tagName).toBe('BUTTON');
      expect(trigger).toHaveAttribute('data-sorbet-shape', 'field');
      expect(trigger).toHaveTextContent('common.pick_a_date');
    }
    expect(start).not.toBe(end);
  });
});

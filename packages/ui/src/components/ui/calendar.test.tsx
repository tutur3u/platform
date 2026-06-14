import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Calendar } from './calendar';

vi.mock('react-day-picker', () => ({
  DayPicker: ({ fixedWeeks }: { fixedWeeks?: boolean }) => (
    <div data-fixed-weeks={String(fixedWeeks)} data-testid="day-picker" />
  ),
}));

vi.mock('../../hooks/use-calendar-preferences', () => ({
  useCalendarPreferences: () => ({ weekStartsOn: 1 }),
}));

describe('Calendar', () => {
  it('renders DayPicker with fixed weeks to avoid layout shift', () => {
    render(<Calendar mode="single" />);

    expect(screen.getByTestId('day-picker')).toHaveAttribute(
      'data-fixed-weeks',
      'true'
    );
  });
});

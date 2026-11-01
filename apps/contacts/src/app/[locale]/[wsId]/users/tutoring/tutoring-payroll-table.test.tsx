import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TutoringPayrollTable } from './tutoring-payroll-table';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

const slot = (key: string, status: string) => ({
  key,
  date: '2026-10-01',
  time: '09:00:00',
  duration_minutes: 60,
  learner_count: 2,
  status,
  total_cong: 1234.5,
});

const rows = [
  {
    teacher_id: 't1',
    teacher_name: 'Ms Lan',
    completed_sessions: 3,
    student_visits: 5,
    total_minutes: 180,
    total_cong: 1234.5,
    pending_past: 1,
    slots: [slot('a', 'DONE')],
  },
  {
    teacher_id: null,
    teacher_name: 'Unassigned',
    completed_sessions: 1,
    student_visits: 1,
    total_minutes: 30,
    total_cong: 0,
    pending_past: 0,
    slots: [slot('b', 'NO_SHOW')],
  },
] as never;

describe('TutoringPayrollTable', () => {
  it('renders headers and formatted totals', () => {
    render(<TutoringPayrollTable rows={rows} />);
    for (const key of [
      'payroll_teachers',
      'payroll_slots',
      'payroll_visits',
      'payroll_minutes',
      'payroll_cong',
      'payroll_pending',
    ]) {
      expect(screen.getByText(key)).toBeTruthy();
    }
    expect(screen.getByText('1,234.50')).toBeTruthy();
    expect(screen.getByText('0.00')).toBeTruthy();
  });

  it.each([
    ['Ms Lan', 'status_done'],
    ['Unassigned', 'status_no_show'],
  ])('expands and collapses %s', (name, statusKey) => {
    render(<TutoringPayrollTable rows={rows} />);
    const button = screen.getByRole('button', { name });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/09:00 – 10:00/)).toBeTruthy();
    expect(screen.getByText(new RegExp(statusKey))).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByText(/09:00 – 10:00/)).toBeNull();
  });

  it('renders no body rows when empty', () => {
    render(<TutoringPayrollTable rows={[]} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

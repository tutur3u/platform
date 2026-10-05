import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type PropsWithChildren, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  newRecurrenceDraft,
  type RecurrenceDraft,
  recurrenceDraftPayload,
} from './native-recurrence-model';
import { NativeRecurrencePatternFields } from './native-recurrence-pattern-fields';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../../select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: PropsWithChildren<{
    value: string;
    onValueChange: (value: string) => void;
  }>) => (
    <select
      aria-label={value}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: PropsWithChildren) => <>{children}</>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectItem: ({ children, value }: PropsWithChildren<{ value: string }>) => (
    <option value={value}>{children}</option>
  ),
}));
vi.mock('../../checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  ),
}));
afterEach(cleanup);
function Form({ initial }: { initial?: Partial<RecurrenceDraft> }) {
  const [draft, setDraft] = useState({
    ...newRecurrenceDraft('UTC', new Date('2026-03-27T09:00:00Z')),
    title: 'Review',
    frequency: 'monthly' as const,
    ...initial,
  });
  const [result, setResult] = useState('');
  return (
    <>
      <NativeRecurrencePatternFields draft={draft} setDraft={setDraft} />
      <button
        type="button"
        onClick={() =>
          setResult(JSON.stringify(recurrenceDraftPayload(draft).rule))
        }
      >
        Save
      </button>
      <output>{result}</output>
    </>
  );
}
describe('relative recurrence pattern controls', () => {
  it('changes an absolute monthly series to the last Friday without changing its start', () => {
    render(<Form />);
    fireEvent.change(screen.getByLabelText('day'), {
      target: { value: 'weekday' },
    });
    fireEvent.change(screen.getByLabelText('4'), { target: { value: '-1' } });
    expect(screen.getByText('relativeWeekdayHelp')).toBeInTheDocument();
    expect(screen.queryByLabelText('monthDay')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Save'));
    expect(JSON.parse(screen.getByRole('status').textContent!)).toMatchObject({
      weekdays: ['FR'],
      weekIndex: -1,
      frequency: 'monthly',
    });
  });
  it('edits a yearly relative rule with explicit month and retains ending count', () => {
    render(
      <Form
        initial={{
          frequency: 'yearly',
          monthPattern: 'weekday',
          weekIndex: '-1',
          month: '3',
          endType: 'count',
          endValue: '8',
        }}
      />
    );
    expect(screen.getByLabelText('month')).toHaveValue(3);
    fireEvent.click(screen.getByText('Save'));
    expect(JSON.parse(screen.getByRole('status').textContent!)).toMatchObject({
      frequency: 'yearly',
      month: 3,
      weekIndex: -1,
      end: { type: 'count', count: 8 },
    });
  });
  it('allows explicitly choosing month-end overflow', () => {
    render(
      <Form
        initial={{
          startLocal: '2026-03-31T09:00',
          endLocal: '2026-03-31T10:00',
          monthDay: '31',
        }}
      />
    );
    fireEvent.change(screen.getByLabelText('skip'), {
      target: { value: 'last-day' },
    });
    fireEvent.click(screen.getByText('Save'));
    expect(JSON.parse(screen.getByRole('status').textContent!)).toMatchObject({
      monthDay: 31,
      monthDayOverflow: 'last-day',
    });
  });
  it('hides month controls for weekly series and updates selected weekdays', () => {
    render(<Form initial={{ frequency: 'weekly' }} />);
    expect(screen.queryByText('monthPattern')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('MO'));
    fireEvent.click(screen.getByText('Save'));
    expect(JSON.parse(screen.getByRole('status').textContent!)).toMatchObject({
      weekdays: ['FR', 'MO'],
    });
  });
});

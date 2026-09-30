import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DateTimePicker } from './date-time-picker';
import {
  createPickerTimeOptions,
  filterPickerTimeOptions,
  pickerCalendarBounds,
  pickerCalendarDate,
  pickerTimeValue,
  pickerWallTime,
} from './date-time-picker-values';
import { eventEndPickerBounds } from './legacy/calendar/event-picker-bounds';

const zone = 'Asia/Ho_Chi_Minh';
const start = new Date('2026-10-01T03:00:00Z');
const end = new Date('2026-10-01T04:00:00Z');

function EndPicker() {
  const [date, setDate] = useState<Date | undefined>(end);
  return (
    <>
      <DateTimePicker
        date={date}
        setDate={setDate}
        inline
        {...eventEndPickerBounds(start.toISOString(), zone, false)}
        preferences={{ timezone: zone, timeFormat: '24h' }}
      />
      <output aria-label="Stored end">{date?.toISOString()}</output>
    </>
  );
}

describe('calendar picker bounds with a different browser day', () => {
  it('rejects nonexistent DST wall times and retains an unchanged later overlap instant', () => {
    const gap = new Date('2026-03-08T06:30:00Z');
    const ny = 'America/New_York';
    expect(pickerWallTime(gap, 2, 30, ny)).toBeUndefined();
    const options = filterPickerTimeOptions({
      date: gap,
      zone: ny,
      pattern: 'HH:mm',
      timeFormat: '24h',
      options: createPickerTimeOptions('HH:mm'),
    });
    expect(options.some((x) => x.value.startsWith('02:'))).toBe(false);
    const overlap = new Date('2026-11-01T06:30:00Z');
    expect(pickerWallTime(overlap, 1, 30, ny)?.toISOString()).toBe(
      overlap.toISOString()
    );
  });

  it('keeps a nonexistent manual time invalid without changing the stored instant', () => {
    let saved = new Date('2026-03-08T06:30:00Z');
    render(
      <DateTimePicker
        date={saved}
        setDate={(next) => {
          if (next) saved = next;
        }}
        inline
        preferences={{ timezone: 'America/New_York' }}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to manual time entry' })
    );
    const input = screen.getByRole('textbox', {
      name: 'Enter time manually in HH:MM',
    });
    fireEvent.change(input, { target: { value: '02:30' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(saved.toISOString()).toBe('2026-03-08T06:30:00.000Z');
  });
  it('preserves a later overlap instant when its calendar day is reselected', () => {
    let saved = new Date('2026-11-01T06:30:00Z');
    render(
      <DateTimePicker
        date={saved}
        setDate={(next) => {
          if (next) saved = next;
        }}
        inline
        preferences={{ timezone: 'America/New_York' }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /November 1st, 2026/ }));
    expect(saved.toISOString()).toBe('2026-11-01T06:30:00.000Z');
  });

  it('does not normalize a selected date into a nonexistent DST wall time', () => {
    let saved = new Date('2026-03-07T07:30:00Z');
    render(
      <DateTimePicker
        date={saved}
        setDate={(next) => {
          if (next) saved = next;
        }}
        inline
        preferences={{ timezone: 'America/New_York' }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /March 8th, 2026/ }));
    expect(saved.toISOString()).toBe('2026-03-07T07:30:00.000Z');
  });

  it('shows October and accepts 11:30 as 04:30Z in the actual end picker', () => {
    render(<EndPicker />);
    expect(screen.getByText('October')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to manual time entry' })
    );
    const input = screen.getByRole('textbox', {
      name: 'Enter time manually in HH:MM',
    });
    fireEvent.change(input, { target: { value: '11:30' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByLabelText('Stored end').textContent).toBe(
      '2026-10-01T04:30:00.000Z'
    );
  });

  it('offers 10:15 onward rather than browser-local 20:15 onward', () => {
    const options = filterPickerTimeOptions({
      date: end,
      minDate: start,
      minTime: pickerTimeValue(start, zone),
      zone,
      pattern: 'HH:mm',
      timeFormat: '24h',
      options: createPickerTimeOptions('HH:mm'),
    });
    expect(options[0]?.value).toBe('10:15');
    expect(options.some((x) => x.value === '11:30')).toBe(true);
    expect(options.some((x) => x.value === '09:45')).toBe(false);
    expect(pickerCalendarDate(start, zone).getDate()).toBe(1);
    expect(pickerCalendarBounds(start, undefined, zone)?.[0]).toEqual({
      before: new Date(2026, 9, 1),
    });
  });

  it('offers a full next calendar day across browser midnight', () => {
    const options = filterPickerTimeOptions({
      date: new Date('2026-10-01T17:30:00Z'),
      minDate: start,
      minTime: '10:00',
      zone,
      pattern: 'HH:mm',
      timeFormat: '24h',
      options: createPickerTimeOptions('HH:mm'),
    });
    expect(options[0]?.value).toBe('00:00');
    expect(options).toHaveLength(96);
  });

  it('uses maxDate time and calendar boundary in the configured zone', () => {
    const maxDate = new Date('2026-10-01T05:00:00Z');
    const options = filterPickerTimeOptions({
      date: end,
      maxDate,
      zone,
      pattern: 'HH:mm',
      timeFormat: '24h',
      options: createPickerTimeOptions('HH:mm'),
    });
    expect(options.at(-1)?.value).toBe('11:45');
    expect(pickerCalendarBounds(undefined, maxDate, zone)?.[0]).toEqual({
      after: new Date(2026, 9, 1),
    });
  });
});

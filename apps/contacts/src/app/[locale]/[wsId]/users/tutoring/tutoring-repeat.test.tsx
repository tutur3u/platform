import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TutoringCreateSlots } from './tutoring-create-slots';
import { DEFAULT_FORM, type TutoringFormValues } from './tutoring-types';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./tutoring-teacher-picker', () => ({
  TutoringTeacherPicker: () => null,
}));

type Slot = TutoringFormValues['sessionSlots'][number];

function slot(sessionDate: string, overrides: Partial<Slot> = {}): Slot {
  return {
    sessionDate,
    startTime: '18:00',
    durationMinutes: 45,
    teacherUserId: 'fixture-teacher',
    ...overrides,
  };
}

function Draft({ slots }: { slots: Slot[] }) {
  const [form, setForm] = useState({
    ...DEFAULT_FORM,
    groupId: 'fixture-class',
    studentUserId: 'fixture-student',
    sessionSlots: slots,
  });
  return (
    <>
      <TutoringCreateSlots
        conflictingIndexes={new Set()}
        form={form}
        onChange={setForm}
        teacherOptions={[]}
        wsId="fixture-workspace"
      />
      <output data-testid="draft">{JSON.stringify(form.sessionSlots)}</output>
    </>
  );
}

function repeat() {
  fireEvent.click(screen.getByRole('button', { name: 'add_weekly_slot' }));
}

function expectDraft(slots: Slot[]) {
  expect(JSON.parse(screen.getByTestId('draft').textContent ?? 'null')).toEqual(
    slots
  );
}

describe('tutoring repeat weekly', () => {
  it('repeats both Saturday and Sunday with their own time, duration and teacher', () => {
    const saturday = slot('2026-10-24', { startTime: '09:00' });
    const sunday = slot('2026-10-25', {
      startTime: '14:00',
      durationMinutes: 90,
      teacherUserId: 'fixture-sunday-teacher',
    });
    render(<Draft slots={[saturday, sunday]} />);
    repeat();
    expectDraft([
      saturday,
      sunday,
      { ...saturday, sessionDate: '2026-10-31' },
      { ...sunday, sessionDate: '2026-11-01' },
    ]);
  });

  it.each([
    {
      name: 'Mon/Wed/Fri',
      dates: ['2026-10-19', '2026-10-21', '2026-10-23'],
      next: ['2026-10-26', '2026-10-28', '2026-10-30'],
    },
    {
      name: 'Tue/Thu/Sat/Sun',
      dates: ['2026-10-20', '2026-10-22', '2026-10-24', '2026-10-25'],
      next: ['2026-10-27', '2026-10-29', '2026-10-31', '2026-11-01'],
    },
    {
      name: 'every weekday',
      dates: [
        '2026-10-19',
        '2026-10-20',
        '2026-10-21',
        '2026-10-22',
        '2026-10-23',
        '2026-10-24',
        '2026-10-25',
      ],
      next: [
        '2026-10-26',
        '2026-10-27',
        '2026-10-28',
        '2026-10-29',
        '2026-10-30',
        '2026-10-31',
        '2026-11-01',
      ],
    },
    {
      name: 'Sat to Sun to Mon across the week boundary',
      dates: ['2026-10-24', '2026-10-25', '2026-10-26'],
      next: ['2026-10-31', '2026-11-01', '2026-11-02'],
    },
    {
      name: 'a repeat beginning mid-week',
      dates: ['2026-10-21', '2026-10-23', '2026-10-26'],
      next: ['2026-10-28', '2026-10-30', '2026-11-02'],
    },
  ])('repeats $name', ({ dates, next }) => {
    const slots = dates.map((date) => slot(date));
    render(<Draft slots={slots} />);
    repeat();
    expectDraft([...slots, ...next.map((date) => slot(date))]);
  });

  it.each(['22:30', '00:30'])(
    'keeps GMT+7 weekdays and local %s time across UTC conversion',
    (time) => {
      // Tutoring stores civil dates/times separately. UTC transport must be
      // interpreted in the center timezone before building these draft fields.
      const utcSaturday = new Date(`2026-10-24T${time}:00+07:00`).toISOString();
      const zoned = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(utcSaturday));
      expect(zoned).toBe('2026-10-24');
      if (time === '00:30')
        expect(utcSaturday).toBe('2026-10-23T17:30:00.000Z');
      const slots = [
        slot(zoned, { startTime: time }),
        slot('2026-10-25', { startTime: time }),
      ];
      render(<Draft slots={slots} />);
      repeat();
      expectDraft([
        ...slots,
        slot('2026-10-31', { startTime: time }),
        slot('2026-11-01', { startTime: time }),
      ]);
    }
  );

  it('repeating twice appends each weekday once per week without exponential copies', () => {
    const slots = [slot('2026-10-24'), slot('2026-10-25')];
    render(<Draft slots={slots} />);
    repeat();
    repeat();
    expectDraft([
      ...slots,
      slot('2026-10-31'),
      slot('2026-11-01'),
      slot('2026-11-07'),
      slot('2026-11-08'),
    ]);
  });

  it('keeps single-weekday repeats unchanged across a year boundary', () => {
    render(<Draft slots={[slot('2026-12-27')]} />);
    repeat();
    repeat();
    expectDraft([slot('2026-12-27'), slot('2027-01-03'), slot('2027-01-10')]);
  });

  it('uses chronological dates even if the rows were entered out of order', () => {
    const slots = [slot('2026-10-25'), slot('2026-10-24')];
    render(<Draft slots={slots} />);
    repeat();
    expectDraft([...slots, slot('2026-10-31'), slot('2026-11-01')]);
  });

  it('retains multiple times on the same weekday', () => {
    const slots = [
      slot('2026-10-24', { startTime: '09:00' }),
      slot('2026-10-24', { startTime: '14:00' }),
      slot('2026-10-25'),
    ];
    render(<Draft slots={slots} />);
    repeat();
    expectDraft([
      ...slots,
      slot('2026-10-31', { startTime: '09:00' }),
      slot('2026-10-31', { startTime: '14:00' }),
      slot('2026-11-01'),
    ]);
  });

  it('uses the latest details for each weekday/time when weeks are incomplete', () => {
    const slots = [
      slot('2026-10-24', { durationMinutes: 30 }),
      slot('2026-10-25'),
      slot('2026-10-31', { durationMinutes: 90 }),
    ];
    render(<Draft slots={slots} />);
    repeat();
    expectDraft([
      ...slots,
      slot('2026-11-01'),
      slot('2026-11-07', { durationMinutes: 90 }),
    ]);
  });

  it('does not repeat an undated row or prevent adding a manual row', () => {
    render(<Draft slots={[slot('')]} />);
    expect(
      screen.getByRole('button', { name: 'add_weekly_slot' })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'add_session_slot' }));
    expectDraft([slot(''), slot('', { teacherUserId: '' })]);
  });

  it('allows a complete repeat that reaches exactly 50 sessions', () => {
    const slots = Array.from({ length: 49 }, (_, i) =>
      slot(new Date(Date.UTC(2026, 9, 3 + i * 7)).toISOString().slice(0, 10))
    );
    render(<Draft slots={slots} />);
    expect(
      screen.getByRole('button', { name: 'add_weekly_slot' })
    ).toBeEnabled();
    repeat();
    expectDraft([
      ...slots,
      slot(new Date(Date.UTC(2026, 9, 3 + 49 * 7)).toISOString().slice(0, 10)),
    ]);
    expect(
      screen.getByRole('button', { name: 'add_weekly_slot' })
    ).toBeDisabled();
  });

  it('disables repeat when a full week would exceed the 50-session API limit', () => {
    const slots = Array.from({ length: 49 }, (_, i) =>
      slot(new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10))
    );
    render(<Draft slots={slots} />);
    expect(
      screen.getByRole('button', { name: 'add_weekly_slot' })
    ).toBeDisabled();
    repeat();
    expectDraft(slots);
  });
});

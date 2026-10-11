import {
  assessTeacherHoursSlot,
  resolveTeacherHours,
} from '@tuturuuu/utils/tutoring-teacher-hours';
import { expect, it } from 'vitest';
import { createDefaultHoursSettings } from './hour-settings-shared';

it('does not turn Calendar auto-created defaults into confirmed teacher hours', () => {
  // Calendar defaults are valid for scheduling, but do not imply teacher consent.
  expect(createDefaultHoursSettings().workHours.monday).toEqual({
    enabled: true,
    timeBlocks: [{ startTime: '07:00', endTime: '23:00' }],
  });
  expect(
    resolveTeacherHours(null, null).every((day) => day.state === 'unknown')
  ).toBe(true);
  expect(
    assessTeacherHoursSlot(null, null, {
      date: '2026-10-05',
      start: '09:00',
      endDate: '2026-10-05',
      end: '10:00',
    })
  ).toEqual({ state: 'unknown' });
});

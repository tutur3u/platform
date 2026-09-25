import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { describe, expect, it } from 'vitest';
import { getEventLocationType } from './working-location';

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'event',
  start_at: '2026-09-25T00:00:00Z',
  end_at: '2026-09-26T00:00:00Z',
  ...overrides,
});

describe('Google working locations', () => {
  it('uses provider metadata even when the title differs', () => {
    expect(
      getEventLocationType(
        event({
          title: 'Remote today',
          scheduling_metadata: {
            google_event_type: 'workingLocation',
            google_working_location_type: 'homeOffice',
          },
        })
      )
    ).toBe('home');
  });

  it('keeps legacy Home and Office location events visible', () => {
    expect(getEventLocationType(event({ title: 'Home' }))).toBe('home');
    expect(getEventLocationType(event({ title: 'Office' }))).toBe('office');
    expect(getEventLocationType(event({ title: 'School' }))).toBe('school');
  });

  it('displays custom Google School locations distinctly', () => {
    expect(
      getEventLocationType(
        event({
          title: 'Campus',
          scheduling_metadata: {
            google_event_type: 'workingLocation',
            google_working_location_type: 'customLocation',
            google_working_location_label: 'School',
          },
        })
      )
    ).toBe('school');
  });
});

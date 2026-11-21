import { describe, expect, it } from 'vitest';
import { allDayVisibleRows, MAX_EVENTS_DISPLAY } from './all-day-event-layout';

describe('compact all-day lane rows', () => {
  it('shows every event when the day fits the collapsed lane', () => {
    expect(allDayVisibleRows(MAX_EVENTS_DISPLAY, false)).toEqual({
      events: MAX_EVENTS_DISPLAY,
      hidden: 0,
      rows: MAX_EVENTS_DISPLAY,
    });
  });

  it('keeps an overflowing collapsed day within the lane, with a +N row', () => {
    expect(allDayVisibleRows(3, false)).toEqual({
      events: 1,
      hidden: 2,
      rows: MAX_EVENTS_DISPLAY,
    });
    expect(allDayVisibleRows(7, false).rows).toBe(MAX_EVENTS_DISPLAY);
  });

  it('expands to every event plus its collapse row', () => {
    expect(allDayVisibleRows(4, true)).toEqual({
      events: 4,
      hidden: 0,
      rows: 5,
    });
  });

  it('uses no rows for an empty day', () => {
    expect(allDayVisibleRows(0, false)).toEqual({
      events: 0,
      hidden: 0,
      rows: 0,
    });
  });
});

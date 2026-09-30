import { describe, expect, it } from 'vitest';
import {
  googleColorCompatibilityValue,
  opaqueGoogleColor,
  resolveGoogleEventColor,
} from './google-calendar-colors';

describe('Google event color resolution', () => {
  it('preserves inherited custom calendar RGB instead of substituting BLUE', () => {
    expect(
      resolveGoogleEventColor(
        { colorId: null },
        {
          calendarId: 'personal',
          calendarBackground: '#F691B2',
          calendarForeground: '#000000',
        }
      )
    ).toEqual({
      version: 1,
      calendar_id: 'personal',
      color_id: null,
      event_label_id: null,
      inherited: true,
      background: '#f691b2',
      foreground: '#000000',
      resolution: 'calendar',
    });
  });
  it('uses all current event definitions, independently from calendar palette IDs', () => {
    for (let id = 1; id <= 11; id++) {
      const key = String(id);
      expect(
        resolveGoogleEventColor(
          { colorId: key },
          {
            eventColors: {
              [key]: { background: '#039BE5', foreground: '#ffffff' },
            },
            calendarBackground: '#f691b2',
          }
        )
      ).toMatchObject({
        color_id: key,
        background: '#039be5',
        inherited: false,
        resolution: 'event',
      });
    }
    expect(googleColorCompatibilityValue('7')).toBe('CYAN');
    expect(googleColorCompatibilityValue('11')).toBe('RED');
  });
  it('prioritizes calendar-scoped labels over legacy color IDs', () => {
    expect(
      resolveGoogleEventColor(
        { eventLabelId: 'custom-label', colorId: '7' },
        {
          eventLabels: [{ id: 'custom-label', backgroundColor: '#a123bc' }],
          eventColors: { '7': { background: '#039be5' } },
        }
      )
    ).toMatchObject({
      event_label_id: 'custom-label',
      color_id: '7',
      background: '#a123bc',
      resolution: 'label',
    });
  });
  it('retains unknown explicit IDs and reports unresolved instead of inherited', () => {
    expect(
      resolveGoogleEventColor(
        { eventLabelId: 'unknown' },
        { calendarBackground: '#f691b2' }
      )
    ).toMatchObject({
      inherited: false,
      event_label_id: 'unknown',
      background: null,
      resolution: 'unresolved',
    });
  });
  it('accepts only opaque RGB for rendering', () => {
    expect(opaqueGoogleColor('#039BE5')).toBe('#039be5');
    for (const value of ['#039be580', 'red', 'url(x)', '#fff'])
      expect(opaqueGoogleColor(value)).toBeNull();
  });
});

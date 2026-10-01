import { describe, expect, it } from 'vitest';
import {
  calendarColorForeground,
  calendarEventColors,
  calendarEventStyle,
} from '../calendar-event-colors';

const metadata = (inherited: boolean, background: unknown = '#abcdef') => ({
  google_color: { version: 1, inherited, background },
});

describe('effective opaque calendar rendering', () => {
  it('preserves explicit provider RGB instead of the canonical FK or source RGB', () => {
    expect(
      calendarEventStyle({
        color: 'BLUE',
        _calendarColor: '#ff0000',
        scheduling_metadata: metadata(false, '#00ff88'),
      })
    ).toEqual({
      backgroundColor: '#00ff88',
      borderColor: '#00ff88',
      color: '#000000',
    });
  });
  it('updates inherited events from current source RGB before historical metadata', () => {
    expect(
      calendarEventColors({
        _calendarColor: '#ff80ab',
        scheduling_metadata: metadata(true, '#00ff88'),
      }).background
    ).toBe('#ff80ab');
  });
  it('retains resolved inherited metadata when current source RGB is unavailable', () => {
    expect(
      calendarEventColors({
        _calendarColor: 'rgba(0,0,0,.1)',
        scheduling_metadata: metadata(true),
      }).background
    ).toBe('#abcdef');
  });
  it('does not infer inheritance for unknown explicit or legacy rows', () => {
    for (const scheduling_metadata of [
      undefined,
      metadata(false, null),
      metadata(false, '#ff000080'),
    ]) {
      expect(
        calendarEventStyle({
          color: 'GREEN',
          _calendarColor: '#ff80ab',
          scheduling_metadata,
        }).backgroundColor
      ).toBe('#4caf50');
    }
  });
  it('uses readable opaque text across pale and dark colors', () => {
    expect(calendarColorForeground('#ffffff')).toBe('#000000');
    expect(calendarColorForeground('#000000')).toBe('#ffffff');
    for (const background of [
      '#a4bdfc',
      '#7ae7bf',
      '#dbadff',
      '#ff887c',
      '#fbd75b',
      '#ffb878',
      '#46d6db',
      '#e1e1e1',
      '#5484ed',
      '#51b749',
      '#dc2127',
    ]) {
      const text = calendarColorForeground(background);
      const rgb = [1, 3, 5]
        .map((i) => parseInt(background.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      const l = rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
      expect(
        text === '#000000' ? (l + 0.05) / 0.05 : 1.05 / (l + 0.05)
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

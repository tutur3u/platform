import { describe, expect, it } from 'vitest';
import {
  calendarColorForeground,
  calendarEventAccent,
  calendarEventColors,
  calendarEventHue,
  calendarEventStyle,
  calendarHueForColor,
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
      backgroundColor:
        'color-mix(in oklab, var(--green) 18%, var(--background))',
      borderColor: 'var(--green)',
      color: 'var(--foreground)',
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
        calendarEventColors({
          color: 'GREEN',
          _calendarColor: '#ff80ab',
          scheduling_metadata,
        }).background
      ).toBe('#4caf50');
    }
  });
  it('retains legacy grey and stored grey RGB aliases', () => {
    expect(calendarEventColors({ color: 'grey' }).background).toBe('#9e9e9e');
    expect(calendarEventColors({ color: '#6b7280' }).background).toBe(
      '#6b7280'
    );
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
      ...[
        'BLUE',
        'RED',
        'GREEN',
        'YELLOW',
        'PURPLE',
        'PINK',
        'ORANGE',
        'INDIGO',
        'CYAN',
        'GRAY',
        'grey',
        '#6b7280',
      ].map((color) => calendarEventColors({ color }).background),
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

describe('design-system event hues', () => {
  it('maps Google palette colors to the nearest theme hue', () => {
    expect(calendarHueForColor('#d50000')).toBe('red'); // Tomato
    expect(calendarHueForColor('#e67c73')).toBe('red'); // Flamingo
    expect(calendarHueForColor('#f4511e')).toBe('orange'); // Tangerine
    expect(calendarHueForColor('#f6bf26')).toBe('yellow'); // Banana
    expect(calendarHueForColor('#7fff00')).toBe('lime');
    expect(calendarHueForColor('#00ffff')).toBe('cyan');
    expect(calendarHueForColor('#00ffaa')).toBe('teal');
    expect(calendarHueForColor('#33b679')).toBe('green'); // Sage
    expect(calendarHueForColor('#0b8043')).toBe('green'); // Basil
    expect(calendarHueForColor('#039be5')).toBe('sky'); // Peacock
    expect(calendarHueForColor('#3f51b5')).toBe('blue'); // Blueberry
    expect(calendarHueForColor('#7986cb')).toBe('blue'); // Lavender
    expect(calendarHueForColor('#5b3fd6')).toBe('indigo');
    expect(calendarHueForColor('#8e24aa')).toBe('purple'); // Grape
    expect(calendarHueForColor('#e91e63')).toBe('rose');
    expect(calendarHueForColor('#d81b60')).toBe('rose');
    expect(calendarHueForColor('#e040a0')).toBe('pink');
    expect(calendarHueForColor('#616161')).toBe('gray'); // Graphite
    expect(calendarHueForColor('#795548')).toBe('orange'); // Cocoa
  });

  it('maps canonical first-party colors to their own hue', () => {
    for (const [color, hue] of [
      ['BLUE', 'blue'],
      ['RED', 'red'],
      ['GREEN', 'green'],
      ['YELLOW', 'yellow'],
      ['PURPLE', 'purple'],
      ['PINK', 'pink'],
      ['ORANGE', 'orange'],
      ['INDIGO', 'indigo'],
      ['CYAN', 'cyan'],
      ['GRAY', 'gray'],
      ['grey', 'gray'],
      ['#6b7280', 'gray'],
    ] as const) {
      expect(calendarEventHue({ color })).toBe(hue);
    }
  });

  it('renders surfaces and accents only from theme variables', () => {
    const style = calendarEventStyle({ color: 'PURPLE' });
    expect(Object.values(style).join(' ')).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(calendarEventAccent({ color: 'PURPLE' })).toBe('var(--purple)');
  });
});

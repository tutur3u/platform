import { afterEach, describe, expect, it } from 'vitest';
import {
  applySorbetTheme,
  DEFAULT_SORBET_THEME,
  parseSorbetAccent,
  parseSorbetTheme,
  readStoredSorbetTheme,
  SORBET_THEME_STORAGE_KEY,
  serializeSorbetTheme,
} from './sorbet-theme';

const root = () => document.documentElement;

afterEach(() => {
  for (const attribute of [
    'data-sorbet-preset',
    'data-sorbet-radius',
    'data-sorbet-density',
    'data-sorbet-font',
  ]) {
    root().removeAttribute(attribute);
  }
  window.localStorage.clear();
});

describe('parseSorbetTheme', () => {
  it('returns the default for empty, malformed or oversized input', () => {
    for (const raw of [
      undefined,
      null,
      '',
      'not json',
      '[]',
      42,
      JSON.stringify({ preset: 'matcha', pad: 'x'.repeat(600) }),
    ]) {
      expect(parseSorbetTheme(raw)).toEqual(DEFAULT_SORBET_THEME);
    }
  });

  it('keeps allowlisted values and resets the rest field by field', () => {
    expect(
      parseSorbetTheme(
        JSON.stringify({
          preset: 'high-contrast',
          accent: '#ABCDEF',
          radius: 'round',
          density: 'huge',
          font: 'comic',
          extra: 'dropped',
        })
      )
    ).toEqual({
      preset: 'high-contrast',
      accent: '#abcdef',
      radius: 'round',
      density: 'comfortable',
      font: 'nunito',
    });
  });

  it('rejects anything but a six-digit hex accent', () => {
    for (const accent of [
      'red',
      '#fff',
      '#12345678',
      'url(x)',
      '#12345g',
      '#123456;color:red',
      'var(--x)',
    ]) {
      expect(parseSorbetAccent(accent)).toBeNull();
    }
    expect(parseSorbetAccent(' #A1B2C3 ')).toBe('#a1b2c3');
  });

  it('serializes known fields in a fixed order', () => {
    expect(
      serializeSorbetTheme({
        font: 'system',
        preset: 'lagoon',
        accent: null,
        density: 'compact',
        radius: 'sharp',
      })
    ).toBe(
      '{"preset":"lagoon","accent":null,"radius":"sharp","density":"compact","font":"system"}'
    );
  });
});

describe('applySorbetTheme', () => {
  it('leaves no attributes for the default theme', () => {
    applySorbetTheme(DEFAULT_SORBET_THEME);

    expect(root().hasAttribute('data-sorbet-preset')).toBe(false);
    expect(root().hasAttribute('data-sorbet-radius')).toBe(false);
    expect(root().hasAttribute('data-sorbet-density')).toBe(false);
    expect(root().hasAttribute('data-sorbet-font')).toBe(false);
  });

  it('sets non-default options, removes them again and remembers the device value', () => {
    applySorbetTheme({ ...DEFAULT_SORBET_THEME, preset: 'midnight' });
    expect(root().getAttribute('data-sorbet-preset')).toBe('midnight');
    expect(readStoredSorbetTheme()?.preset).toBe('midnight');

    applySorbetTheme(DEFAULT_SORBET_THEME);
    expect(root().hasAttribute('data-sorbet-preset')).toBe(false);
    expect(window.localStorage.getItem(SORBET_THEME_STORAGE_KEY)).toBe(
      serializeSorbetTheme(DEFAULT_SORBET_THEME)
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  TUTURUUU_THEME_STORAGE_KEY,
  tuturuuuThemeProviderProps,
} from './theme-provider-preset';

describe('tuturuuuThemeProviderProps', () => {
  it('swaps the theme as one class change', () => {
    expect(tuturuuuThemeProviderProps.attribute).toBe('class');
    // InstantThemeSwap owns transition suppression; the library flag does
    // not flush styles in Chromium.
    expect(tuturuuuThemeProviderProps.disableTransitionOnChange).toBe(false);
  });

  it('shares one storage key so every app on the origin reads the same preference', () => {
    expect(TUTURUUU_THEME_STORAGE_KEY).toBe('theme');
    expect(tuturuuuThemeProviderProps.storageKey).toBe(
      TUTURUUU_THEME_STORAGE_KEY
    );
  });

  it('follows the system preference by default', () => {
    expect(tuturuuuThemeProviderProps.enableSystem).toBe(true);
    expect(tuturuuuThemeProviderProps.defaultTheme).toBe('system');
    expect(tuturuuuThemeProviderProps.themes).toEqual([
      'system',
      'light',
      'dark',
    ]);
  });

  it('keeps Rocket Loader from deferring the no-flash script', () => {
    expect(tuturuuuThemeProviderProps.scriptProps['data-cfasync']).toBe(
      'false'
    );
  });
});

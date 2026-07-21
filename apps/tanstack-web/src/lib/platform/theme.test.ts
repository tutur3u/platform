import { describe, expect, it } from 'vitest';
import {
  createThemeInitScript,
  normalizeThemePreference,
  shouldUseDarkTheme,
} from './theme';

describe('theme adapters', () => {
  it('normalizes stored theme preferences', () => {
    expect(normalizeThemePreference('dark')).toBe('dark');
    expect(normalizeThemePreference('light')).toBe('light');
    expect(normalizeThemePreference('system')).toBe('system');
    expect(normalizeThemePreference('sepia')).toBe('system');
  });

  it('resolves dark mode from preference and system state', () => {
    expect(shouldUseDarkTheme('dark', false)).toBe(true);
    expect(shouldUseDarkTheme('light', true)).toBe(false);
    expect(shouldUseDarkTheme('system', true)).toBe(true);
    expect(shouldUseDarkTheme('system', false)).toBe(false);
  });

  it('builds a Cloudflare-safe inline boot script', () => {
    const script = createThemeInitScript({
      className: 'dark',
      defaultTheme: 'system',
      storageKey: 'theme',
    });

    expect(script).toContain('localStorage.getItem');
    expect(script).toContain('prefers-color-scheme: dark');
    expect(script).toContain('"storageKey":"theme"');
  });

  it('escapes values that could terminate the containing script element', () => {
    const script = createThemeInitScript({
      className: '</script><script>alert(1)</script>',
      storageKey: 'theme&\u2028key',
    });

    expect(script).not.toContain('</script>');
    expect(script).not.toContain('<script>');
    expect(script).not.toContain('\u2028');
    expect(script).toContain('\\u003c/script\\u003e');
    expect(script).toContain('\\u0026\\u2028');
  });
});

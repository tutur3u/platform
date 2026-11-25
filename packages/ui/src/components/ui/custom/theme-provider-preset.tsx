import type { ThemeProvider } from 'next-themes';
import type { ComponentProps } from 'react';

type ThemeProviderProps = Omit<
  ComponentProps<typeof ThemeProvider>,
  'children'
>;

/**
 * Canonical next-themes configuration shared by every Tuturuuu app shell.
 *
 * Apps are served from one origin (`tuturuuu.com/<app>`), so the shared
 * `theme` localStorage key already carries the preference across apps and
 * next-themes' `storage` listener keeps other tabs in sync. Keeping the
 * options identical everywhere guarantees the pre-paint script resolves the
 * same class in every app.
 *
 * - `disableTransitionOnChange` stays off: its style flush is a no-op in
 *   Chromium. Render `<InstantThemeSwap />` inside the provider instead so a
 *   switch lands in one frame rather than animating every element that has
 *   `transition-colors` / `transition-all` for 300-500ms.
 * - `scriptProps['data-cfasync']`: keep Cloudflare Rocket Loader from
 *   deferring the no-flash script.
 *
 * This module deliberately has no `'use client'` directive so server
 * components can spread the plain object.
 */
export const TUTURUUU_THEME_STORAGE_KEY = 'theme';

export const tuturuuuThemeProviderProps = {
  attribute: 'class',
  themes: ['system', 'light', 'dark'],
  defaultTheme: 'system',
  enableSystem: true,
  disableTransitionOnChange: false,
  storageKey: TUTURUUU_THEME_STORAGE_KEY,
  scriptProps: { 'data-cfasync': 'false' },
} satisfies ThemeProviderProps;

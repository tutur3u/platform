'use client';

import { createTheme, MantineProvider } from '@mantine/core';
import { useTheme } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * Minimal Mantine theme configuration for application-wide Mantine components.
 *
 * IMPORTANT: Mantine styles are synchronized with application theme via
 * mantine-theme-override.css to prevent visual discontinuities.
 *
 * The MantineProvider is configured to minimize global pollution:
 * - withCssVariables={false} - Prevents Mantine from injecting global CSS variables
 * - withGlobalClasses={false} - Prevents global utility classes
 * - withStaticClasses={false} - Minimizes class pollution
 *
 * See apps/web/src/style/mantine-theme-override.css for color synchronization.
 * See docs/MANTINE_THEME_SYNC.md for maintenance workflow.
 */
const mantineTheme = createTheme({
  fontFamily: 'inherit',
  defaultRadius: 'md',
  // Prevent Mantine from injecting font sizes - use application's typography
  fontSizes: undefined,
});

interface MantineThemeProviderProps {
  children: ReactNode;
}

/**
 * MantineThemeProvider - Wraps application with Mantine UI library support
 *
 * Integrates with next-themes to automatically sync color scheme (light/dark mode).
 * All Mantine components within this provider will respect the application's theme.
 *
 * Usage: Wrap at root level in providers.tsx
 */
export function MantineThemeProvider({ children }: MantineThemeProviderProps) {
  const { resolvedTheme } = useTheme();

  return (
    <MantineProvider
      theme={mantineTheme}
      forceColorScheme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      withCssVariables={false}
      withGlobalClasses={false}
      withStaticClasses={false}
    >
      {children}
    </MantineProvider>
  );
}

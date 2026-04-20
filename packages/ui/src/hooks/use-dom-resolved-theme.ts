'use client';

import { useEffect, useState } from 'react';

export type DomResolvedTheme = 'light' | 'dark';

const THEME_ATTRIBUTES = ['class', 'data-theme'] as const;

export function getDomResolvedTheme(): DomResolvedTheme {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    const classTheme = root.classList.contains('dark')
      ? 'dark'
      : root.classList.contains('light')
        ? 'light'
        : null;
    const dataTheme = root.getAttribute('data-theme');

    if (classTheme) {
      return classTheme;
    }

    if (dataTheme === 'dark' || dataTheme === 'light') {
      return dataTheme;
    }
  }

  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }

  return 'light';
}

export function useDomResolvedTheme(): DomResolvedTheme {
  const [theme, setTheme] = useState<DomResolvedTheme>(getDomResolvedTheme);

  useEffect(() => {
    const updateTheme = () => {
      setTheme(getDomResolvedTheme());
    };

    updateTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = () => {
      window.setTimeout(updateTheme, 0);
    };

    mediaQuery.addEventListener('change', handleThemeChange);

    const observer = new MutationObserver((mutations) => {
      if (
        mutations.some(
          (mutation) =>
            mutation.type === 'attributes' &&
            THEME_ATTRIBUTES.includes(
              mutation.attributeName as (typeof THEME_ATTRIBUTES)[number]
            )
        )
      ) {
        handleThemeChange();
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [...THEME_ATTRIBUTES],
    });

    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange);
      observer.disconnect();
    };
  }, []);

  return theme;
}

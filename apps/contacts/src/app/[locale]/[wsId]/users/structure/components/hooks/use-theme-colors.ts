import { useCallback, useEffect, useState } from 'react';
import { CHART_CONFIG } from '../constants';

interface ThemeColors {
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  ring: string;
  // Chart specific colors
  cardBackground: string;
  cardBorder: string;
  selectedBorder: string;
  shadow: string;
  textPrimary: string;
  textSecondary: string;
  reportingLine: string;
  collaborationLine: string;
}

/**
 * Custom hook to read theme colors from CSS custom properties
 * Provides dynamic colors that adapt to the current theme (light/dark)
 */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(() => {
    // Initialize with fallback colors
    return {
      background: CHART_CONFIG.FALLBACK_COLORS.BACKGROUND,
      foreground: CHART_CONFIG.FALLBACK_COLORS.TEXT_PRIMARY,
      muted: CHART_CONFIG.FALLBACK_COLORS.DEPARTMENT_BG_FALLBACK,
      mutedForeground: CHART_CONFIG.FALLBACK_COLORS.TEXT_SECONDARY,
      border: CHART_CONFIG.FALLBACK_COLORS.BORDER_DEFAULT,
      input: CHART_CONFIG.FALLBACK_COLORS.BORDER_DEFAULT,
      primary: CHART_CONFIG.FALLBACK_COLORS.BORDER_SELECTED,
      primaryForeground: '#ffffff',
      secondary: CHART_CONFIG.FALLBACK_COLORS.DEPARTMENT_BG_FALLBACK,
      secondaryForeground: CHART_CONFIG.FALLBACK_COLORS.TEXT_SECONDARY,
      accent: CHART_CONFIG.FALLBACK_COLORS.DEPARTMENT_BG_FALLBACK,
      accentForeground: CHART_CONFIG.FALLBACK_COLORS.TEXT_PRIMARY,
      destructive: '#ef4444',
      destructiveForeground: '#ffffff',
      ring: CHART_CONFIG.FALLBACK_COLORS.BORDER_SELECTED,
      // Chart specific
      cardBackground: CHART_CONFIG.FALLBACK_COLORS.BACKGROUND,
      cardBorder: CHART_CONFIG.FALLBACK_COLORS.BORDER_DEFAULT,
      selectedBorder: CHART_CONFIG.FALLBACK_COLORS.BORDER_SELECTED,
      shadow: CHART_CONFIG.FALLBACK_COLORS.SHADOW,
      textPrimary: CHART_CONFIG.FALLBACK_COLORS.TEXT_PRIMARY,
      textSecondary: CHART_CONFIG.FALLBACK_COLORS.TEXT_SECONDARY,
      reportingLine: CHART_CONFIG.FALLBACK_COLORS.REPORTING_LINE,
      collaborationLine: CHART_CONFIG.FALLBACK_COLORS.COLLABORATION_LINE,
    };
  });

  const getColorValue = useCallback(
    (cssVar: string, fallback: string): string => {
      if (typeof window === 'undefined') return fallback;

      const computedStyle = getComputedStyle(document.documentElement);
      const value = computedStyle.getPropertyValue(cssVar).trim();

      if (!value) return fallback;

      // If the value is in HSL format (like "222.2 84% 4.9%"), convert to rgb
      if (
        value.includes('%') &&
        !value.startsWith('rgb') &&
        !value.startsWith('#')
      ) {
        // Convert HSL values to RGB
        const hslValues = value.split(/\s+/);
        if (hslValues.length === 3) {
          if (
            hslValues[0] === undefined ||
            hslValues[1] === undefined ||
            hslValues[2] === undefined
          )
            return fallback;

          const h = parseFloat(hslValues[0]);
          const s = parseFloat(hslValues[1]) / 100;
          const l = parseFloat(hslValues[2]) / 100;

          const a = s * Math.min(l, 1 - l);
          const f = (n: number) => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color);
          };

          return `rgb(${f(0)}, ${f(8)}, ${f(4)})`;
        }
      }

      return value.startsWith('#') || value.startsWith('rgb')
        ? value
        : fallback;
    },
    []
  );

  const updateColors = useCallback(() => {
    setColors({
      background: getColorValue(
        '--background',
        CHART_CONFIG.FALLBACK_COLORS.BACKGROUND
      ),
      foreground: getColorValue(
        '--foreground',
        CHART_CONFIG.FALLBACK_COLORS.TEXT_PRIMARY
      ),
      muted: getColorValue(
        '--muted',
        CHART_CONFIG.FALLBACK_COLORS.DEPARTMENT_BG_FALLBACK
      ),
      mutedForeground: getColorValue(
        '--muted-foreground',
        CHART_CONFIG.FALLBACK_COLORS.TEXT_SECONDARY
      ),
      border: getColorValue(
        '--border',
        CHART_CONFIG.FALLBACK_COLORS.BORDER_DEFAULT
      ),
      input: getColorValue(
        '--input',
        CHART_CONFIG.FALLBACK_COLORS.BORDER_DEFAULT
      ),
      primary: getColorValue(
        '--primary',
        CHART_CONFIG.FALLBACK_COLORS.BORDER_SELECTED
      ),
      primaryForeground: getColorValue('--primary-foreground', '#ffffff'),
      secondary: getColorValue(
        '--secondary',
        CHART_CONFIG.FALLBACK_COLORS.DEPARTMENT_BG_FALLBACK
      ),
      secondaryForeground: getColorValue(
        '--secondary-foreground',
        CHART_CONFIG.FALLBACK_COLORS.TEXT_SECONDARY
      ),
      accent: getColorValue(
        '--accent',
        CHART_CONFIG.FALLBACK_COLORS.DEPARTMENT_BG_FALLBACK
      ),
      accentForeground: getColorValue(
        '--accent-foreground',
        CHART_CONFIG.FALLBACK_COLORS.TEXT_PRIMARY
      ),
      destructive: getColorValue('--destructive', '#ef4444'),
      destructiveForeground: getColorValue(
        '--destructive-foreground',
        '#ffffff'
      ),
      ring: getColorValue(
        '--ring',
        CHART_CONFIG.FALLBACK_COLORS.BORDER_SELECTED
      ),
      // Chart specific colors
      cardBackground: getColorValue(
        '--background',
        CHART_CONFIG.FALLBACK_COLORS.BACKGROUND
      ),
      cardBorder: getColorValue(
        '--border',
        CHART_CONFIG.FALLBACK_COLORS.BORDER_DEFAULT
      ),
      selectedBorder: getColorValue(
        '--primary',
        CHART_CONFIG.FALLBACK_COLORS.BORDER_SELECTED
      ),
      shadow: 'rgba(0, 0, 0, 0.1)',
      textPrimary: getColorValue(
        '--foreground',
        CHART_CONFIG.FALLBACK_COLORS.TEXT_PRIMARY
      ),
      textSecondary: getColorValue(
        '--muted-foreground',
        CHART_CONFIG.FALLBACK_COLORS.TEXT_SECONDARY
      ),
      reportingLine: getColorValue(
        '--border',
        CHART_CONFIG.FALLBACK_COLORS.REPORTING_LINE
      ),
      collaborationLine: getColorValue(
        '--primary',
        CHART_CONFIG.FALLBACK_COLORS.COLLABORATION_LINE
      ),
    });
  }, [getColorValue]);

  useEffect(() => {
    // Update colors on mount
    updateColors();

    // Listen for theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = () => {
      // Small delay to ensure CSS variables have updated
      setTimeout(updateColors, 50);
    };

    mediaQuery.addEventListener('change', handleThemeChange);

    // Listen for manual theme switches (via class changes on html/body)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          (mutation.attributeName === 'class' ||
            mutation.attributeName === 'data-theme')
        ) {
          handleThemeChange();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange);
      observer.disconnect();
    };
  }, [updateColors]);

  return colors;
}

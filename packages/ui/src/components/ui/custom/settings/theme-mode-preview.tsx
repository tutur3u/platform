'use client';

import { useUserConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { cn } from '@tuturuuu/utils/format';
import { parseSorbetTheme, SORBET_THEME_CONFIG_ID } from '../sorbet-theme';
import {
  EXPERIMENTAL_SORBET_UI_CONFIG_ID,
  parseSorbetUiValue,
} from '../sorbet-ui';
import { SorbetPresetSwatch } from './sorbet-preset-swatch';

export type ThemeModePreviewMode = 'light' | 'dark' | 'system';

// The classic design's light and dark grounds. They depict a fixed mode, so
// they cannot follow the active theme's tokens.
const CLASSIC_PREVIEW: Record<ThemeModePreviewMode, string> = {
  light: 'bg-[#ecedef]',
  dark: 'bg-slate-950',
  system: 'bg-linear-to-r from-[#ecedef] to-slate-950',
};

const QUERY_OPTIONS = { retry: false } as const;

/**
 * The picture on a Light, Dark or System theme tile. While Sorbet is on it
 * shows the chosen Sorbet palette's own light and dark sides, so the tiles
 * match the design the person will get.
 *
 * Reads the account values from the shared user-config queries, the same
 * cache entries the Appearance settings and `ExperimentalUiSync` use, so it
 * adds no request.
 */
export function ThemeModePreview({ mode }: { mode: ThemeModePreviewMode }) {
  const { data: enabled } = useUserConfig(
    EXPERIMENTAL_SORBET_UI_CONFIG_ID,
    '',
    QUERY_OPTIONS
  );
  const { data: theme } = useUserConfig(
    SORBET_THEME_CONFIG_ID,
    '',
    QUERY_OPTIONS
  );

  if (!parseSorbetUiValue(enabled)) {
    return (
      <div
        aria-hidden
        data-testid="theme-mode-preview"
        className={cn(
          'h-14 w-full rounded-md border shadow-sm',
          CLASSIC_PREVIEW[mode]
        )}
      />
    );
  }

  const { preset } = parseSorbetTheme(theme);
  return (
    <div
      aria-hidden
      data-testid="theme-mode-preview"
      className="flex h-16 w-full overflow-hidden rounded-md border"
    >
      {mode !== 'dark' && <SorbetPresetSwatch preset={preset} mode="light" />}
      {mode !== 'light' && <SorbetPresetSwatch preset={preset} mode="dark" />}
    </div>
  );
}

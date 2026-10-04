'use client';
import type { LettinTheme } from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';
export const defaultWikiTheme: LettinTheme = {
  palette: 'paper',
  typography: 'editorial',
  motion: 'full',
};
export function WikiThemeEditor({
  theme = defaultWikiTheme,
  onChange,
  label,
}: {
  label?: string;
  theme?: LettinTheme;
  onChange: (theme: LettinTheme) => void;
}) {
  const t = useTranslations('lettin');
  return (
    <fieldset className="notebook-paper grid gap-4 p-5 sm:grid-cols-3">
      <legend className="px-2 text-sm">{label ?? t('worldTheme')}</legend>
      <label className="space-y-2 text-sm">
        {t('themePalette')}
        <select
          className="block w-full rounded border bg-card p-2"
          value={theme.palette}
          onChange={(e) =>
            onChange({
              ...theme,
              palette: e.target.value as LettinTheme['palette'],
            })
          }
        >
          {(['paper', 'forest', 'midnight', 'rose'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`theme${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm">
        {t('themeTypography')}
        <select
          className="block w-full rounded border bg-card p-2"
          value={theme.typography}
          onChange={(e) =>
            onChange({
              ...theme,
              typography: e.target.value as LettinTheme['typography'],
            })
          }
        >
          {(['editorial', 'clean'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`theme${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-sm">
        {t('themeMotion')}
        <select
          className="block w-full rounded border bg-card p-2"
          value={theme.motion}
          onChange={(e) =>
            onChange({
              ...theme,
              motion: e.target.value as LettinTheme['motion'],
            })
          }
        >
          {(['full', 'reduced'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`theme${value}`)}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

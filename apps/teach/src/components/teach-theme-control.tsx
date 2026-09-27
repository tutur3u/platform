'use client';

import { Monitor, Moon, Sun } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

const themeOptions = [
  { icon: Monitor, key: 'system', value: 'system' },
  { icon: Sun, key: 'light', value: 'light' },
  { icon: Moon, key: 'dark', value: 'dark' },
] as const;

export function TeachThemeControl({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('teach');
  const { setTheme, theme } = useTheme();

  return (
    <fieldset
      className={cn(
        'inline-flex h-9 shrink-0 items-center rounded-lg border border-border bg-background p-0.5',
        !compact && 'h-10'
      )}
    >
      <legend className="sr-only">{t('theme')}</legend>
      {themeOptions.map(({ icon: Icon, key, value }) => {
        const active = (theme ?? 'system') === value;

        return (
          <button
            aria-pressed={active}
            className={cn(
              'inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              !compact && 'h-9 min-w-20 px-3 text-sm',
              active
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
            key={value}
            onClick={() => setTheme(value)}
            type="button"
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className={cn(compact && 'sr-only')}>
              {t(`themeOptions.${key}`)}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}

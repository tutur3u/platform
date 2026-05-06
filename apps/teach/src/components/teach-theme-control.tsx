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
        'inline-flex h-10 shrink-0 items-center border-2 border-border bg-background p-1 shadow-[2px_2px_0_var(--border)]',
        !compact && 'h-11 shadow-[3px_3px_0_var(--border)]'
      )}
    >
      <legend className="sr-only">{t('theme')}</legend>
      {themeOptions.map(({ icon: Icon, key, value }) => {
        const active = (theme ?? 'system') === value;

        return (
          <button
            aria-pressed={active}
            className={cn(
              'inline-flex h-8 min-w-9 items-center justify-center gap-1 px-2 font-black text-xs transition active:translate-x-0.5 active:translate-y-0.5',
              !compact && 'h-9 min-w-20 px-3 text-sm',
              active
                ? 'bg-primary text-primary-foreground'
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

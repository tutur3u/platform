'use client';

import { Check, Monitor, Moon, Sun } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { DropdownMenuItem, DropdownMenuSeparator } from '../dropdown-menu';

export function ThemeDropdownItems() {
  const t = useTranslations('common');
  const { theme, systemTheme, setTheme } = useTheme();

  const isSystem = theme === 'system' || theme === null;

  const primaryTheme = theme?.split('-')?.[0] as
    | 'light'
    | 'dark'
    | 'system'
    | undefined;

  const updateTheme = ({
    primary = primaryTheme,
  }: {
    primary?: 'light' | 'dark' | 'system';
    secondary?:
      | 'pink'
      | 'purple'
      | 'yellow'
      | 'orange'
      | 'green'
      | 'blue'
      | null;
  }) => {
    let theme = '';

    if (primary) theme += primary === 'system' ? systemTheme : primary;

    // remove leading dash
    if (theme.startsWith('-')) theme = theme.slice(1);

    setTheme(theme);
  };

  return (
    <>
      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => updateTheme({ primary: 'light' })}
        disabled={primaryTheme === 'light'}
      >
        {primaryTheme === 'light' ? (
          <Check className="h-4 w-4 text-dynamic-yellow" />
        ) : (
          <Sun className="h-4 w-4 text-dynamic-yellow" />
        )}

        {t('light')}
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => updateTheme({ primary: 'dark' })}
        disabled={primaryTheme === 'dark'}
      >
        {primaryTheme === 'dark' ? (
          <Check className="h-4 w-4 text-dynamic-purple" />
        ) : (
          <Moon className="h-4 w-4 text-dynamic-purple" />
        )}

        {t('dark')}
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('system')}
        disabled={isSystem}
      >
        {isSystem ? (
          <Check className="h-4 w-4" />
        ) : (
          <Monitor className="h-4 w-4" />
        )}

        {t('system')}
      </DropdownMenuItem>
    </>
  );
}

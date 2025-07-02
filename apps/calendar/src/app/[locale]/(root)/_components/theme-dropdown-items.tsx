'use client';

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@tuturuuu/ui/dropdown-menu';
import { Check, Monitor, Moon, Sun } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

export function ThemeDropdownItems() {
  const t = useTranslations('common');
  const { theme, systemTheme, setTheme } = useTheme();

  const isSystem = theme === 'system' || theme === null;

  const primaryTheme = theme?.split('-')?.[0] as
    | 'light'
    | 'dark'
    | 'system'
    | undefined;

  // const secondaryTheme = theme?.split('-')?.[1] as
  //   | 'pink'
  //   | 'purple'
  //   | 'yellow'
  //   | 'orange'
  //   | 'green'
  //   | 'blue'
  //   | undefined;

  const updateTheme = ({
    primary = primaryTheme,
    // secondary = secondaryTheme,
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
    // if (secondary) theme += `-${secondary}`;

    // remove leading dash
    if (theme.startsWith('-')) theme = theme.slice(1);

    setTheme(theme);
  };

  return (
    <>
      <DropdownMenuItem
        className="cursor-pointer rounded-md px-3 py-2 font-medium text-sm transition-all duration-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/20 dark:hover:text-blue-300"
        onClick={() => updateTheme({ primary: 'light' })}
        disabled={primaryTheme === 'light'}
      >
        <div className="flex items-center gap-3">
          {primaryTheme === 'light' ? (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white">
              <Check className="h-3 w-3" />
            </div>
          ) : (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400">
              <Sun className="h-3 w-3" />
            </div>
          )}
          <span>{t('light')}</span>
        </div>
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer rounded-md px-3 py-2 font-medium text-sm transition-all duration-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/20 dark:hover:text-blue-300"
        onClick={() => updateTheme({ primary: 'dark' })}
        disabled={primaryTheme === 'dark'}
      >
        <div className="flex items-center gap-3">
          {primaryTheme === 'dark' ? (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white">
              <Check className="h-3 w-3" />
            </div>
          ) : (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              <Moon className="h-3 w-3" />
            </div>
          )}
          <span>{t('dark')}</span>
        </div>
      </DropdownMenuItem>

      {/* <DropdownMenuSeparator />

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => updateTheme({ primary: primaryTheme, secondary: null })}
        disabled={!secondaryTheme}
      >
        {!secondaryTheme ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4" />
        )}
        {t('standard')}
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => updateTheme({ secondary: 'pink' })}
        disabled={secondaryTheme === 'pink'}
      >
        {secondaryTheme === 'pink' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Heart className="mr-2 h-4 w-4" />
        )}
        {t('pink')}
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => updateTheme({ secondary: 'purple' })}
        disabled={secondaryTheme === 'purple'}
      >
        {secondaryTheme === 'purple' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Ghost className="mr-2 h-4 w-4" />
        )}
        {t('purple')}
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => updateTheme({ secondary: 'yellow' })}
        disabled={secondaryTheme === 'yellow'}
      >
        {secondaryTheme === 'yellow' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Crown className="mr-2 h-4 w-4" />
        )}
        {t('yellow')}
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => updateTheme({ secondary: 'orange' })}
        disabled={secondaryTheme === 'orange'}
      >
        {secondaryTheme === 'orange' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Carrot className="mr-2 h-4 w-4" />
        )}
        {t('orange')}
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => updateTheme({ secondary: 'green' })}
        disabled={secondaryTheme === 'green'}
      >
        {secondaryTheme === 'green' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Trees className="mr-2 h-4 w-4" />
        )}
        {t('green')}
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => updateTheme({ secondary: 'blue' })}
        disabled={secondaryTheme === 'blue'}
      >
        {secondaryTheme === 'blue' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Waves className="mr-2 h-4 w-4" />
        )}
        {t('blue')}
      </DropdownMenuItem> */}

      <DropdownMenuSeparator className="my-2 bg-gray-200 dark:bg-gray-700" />

      <DropdownMenuItem
        className="cursor-pointer rounded-md px-3 py-2 font-medium text-sm transition-all duration-200 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/20 dark:hover:text-blue-300"
        onClick={() => setTheme('system')}
        disabled={isSystem}
      >
        <div className="flex items-center gap-3">
          {isSystem ? (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white">
              <Check className="h-3 w-3" />
            </div>
          ) : (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              <Monitor className="h-3 w-3" />
            </div>
          )}
          <span>{t('system')}</span>
        </div>
      </DropdownMenuItem>
    </>
  );
}

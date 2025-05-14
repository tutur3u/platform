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
        className="cursor-pointer"
        onClick={() => updateTheme({ primary: 'light' })}
        disabled={primaryTheme === 'light'}
      >
        {primaryTheme === 'light' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Sun className="mr-2 h-4 w-4" />
        )}

        {t('light')}
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => updateTheme({ primary: 'dark' })}
        disabled={primaryTheme === 'dark'}
      >
        {primaryTheme === 'dark' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Moon className="mr-2 h-4 w-4" />
        )}

        {t('dark')}
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

      <DropdownMenuSeparator className="hidden md:block" />

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('system')}
        disabled={isSystem}
      >
        {isSystem ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Monitor className="mr-2 h-4 w-4" />
        )}

        {t('system')}
      </DropdownMenuItem>
    </>
  );
}

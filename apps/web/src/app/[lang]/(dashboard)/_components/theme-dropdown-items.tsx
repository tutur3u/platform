'use client';

import { useTheme } from 'next-themes';

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Check, Moon, Sparkle, Sun } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';

export function ThemeDropdownItems() {
  const { t } = useTranslation('common');
  const { theme, setTheme } = useTheme();

  const isSystem = theme === 'system' || theme === null;

  return (
    <>
      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('light')}
        disabled={theme === 'light'}
      >
        {theme === 'light' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Sun className="mr-2 h-4 w-4" />
        )}

        {t('light')}
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('light-pink')}
        disabled={theme === 'light-pink'}
      >
        {theme === 'light-pink' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Sun className="mr-2 h-4 w-4" />
        )}
        {t('light_pink')} (v1)
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('light-pink-v2')}
        disabled={theme === 'light-pink-v2'}
      >
        {theme === 'light-pink-v2' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Sun className="mr-2 h-4 w-4" />
        )}
        {t('light_pink')} (v2)
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('dark')}
        disabled={theme === 'dark'}
      >
        {theme === 'dark' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Moon className="mr-2 h-4 w-4" />
        )}

        {t('dark')}
      </DropdownMenuItem>

      {/* <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('dark-pink')}
        disabled={theme === 'dark-pink'}
      >
        {theme === 'dark-pink' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Moon className="mr-2 h-4 w-4" />
        )}

        {t('dark_pink')}
      </DropdownMenuItem> */}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('system')}
        disabled={isSystem}
      >
        {isSystem ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Sparkle className="mr-2 h-4 w-4" />
        )}

        {t('system')}
      </DropdownMenuItem>
    </>
  );
}

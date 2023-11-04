'use client';

import { useTheme } from 'next-themes';

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Check,
  Crown,
  Ghost,
  Heart,
  Moon,
  Sparkles,
  Sun,
  Trees,
} from 'lucide-react';
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
          <Heart className="mr-2 h-4 w-4" />
        )}
        {t('light_pink')}
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('light-purple')}
        disabled={theme === 'light-purple'}
      >
        {theme === 'light-purple' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Ghost className="mr-2 h-4 w-4" />
        )}
        {t('light_purple')}
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('light-yellow')}
        disabled={theme === 'light-yellow'}
      >
        {theme === 'light-yellow' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Crown className="mr-2 h-4 w-4" />
        )}
        {t('light_yellow')}
      </DropdownMenuItem>

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('light-green')}
        disabled={theme === 'light-green'}
      >
        {theme === 'light-green' ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Trees className="mr-2 h-4 w-4" />
        )}
        {t('light_green')}
      </DropdownMenuItem>

      <DropdownMenuSeparator />

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

      <DropdownMenuSeparator />

      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('system')}
        disabled={isSystem}
      >
        {isSystem ? (
          <Check className="mr-2 h-4 w-4" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4" />
        )}

        {t('system')}
      </DropdownMenuItem>
    </>
  );
}

'use client';

import { useTheme } from 'next-themes';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Moon, Sparkle, Sun } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';

export function ThemeDropdownItems() {
  const { t } = useTranslation('common');
  const { setTheme } = useTheme();

  return (
    <>
      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('light')}
      >
        <Sun className="mr-2 h-4 w-4" />
        {t('light')}
      </DropdownMenuItem>
      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('dark')}
      >
        <Moon className="mr-2 h-4 w-4" />
        {t('dark')}
      </DropdownMenuItem>
      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('system')}
      >
        <Sparkle className="mr-2 h-4 w-4" />
        {t('system')}
      </DropdownMenuItem>
    </>
  );
}

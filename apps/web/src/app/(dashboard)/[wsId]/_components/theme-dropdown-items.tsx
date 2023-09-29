'use client';

import { useTheme } from 'next-themes';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Moon, Sparkle, Sun } from 'lucide-react';

export function ThemeDropdownItems() {
  const { setTheme } = useTheme();

  return (
    <>
      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('light')}
      >
        <Sun className="mr-2 h-4 w-4" />
        Light
      </DropdownMenuItem>
      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('dark')}
      >
        <Moon className="mr-2 h-4 w-4" />
        Dark
      </DropdownMenuItem>
      <DropdownMenuItem
        className="cursor-pointer"
        onClick={() => setTheme('system')}
      >
        <Sparkle className="mr-2 h-4 w-4" />
        System
      </DropdownMenuItem>
    </>
  );
}

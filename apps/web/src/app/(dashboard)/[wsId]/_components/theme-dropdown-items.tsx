'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Moon, Sparkle, Sun } from 'lucide-react';

export function ThemeDropdownItems() {
  const { setTheme } = useTheme();

  return (
    <>
      <DropdownMenuItem onClick={() => setTheme('light')}>
        <Sun className="mr-2 h-4 w-4" />
        Light
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setTheme('dark')}>
        <Moon className="mr-2 h-4 w-4" />
        Dark
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setTheme('system')}>
        <Sparkle className="mr-2 h-4 w-4" />
        System
      </DropdownMenuItem>
    </>
  );
}

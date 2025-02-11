'use client';

import { Button } from '@tutur3u/ui/button';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeToggle({
  forceDisplay = false,
}: {
  forceDisplay?: boolean;
}) {
  const { theme, systemTheme, setTheme } = useTheme();

  const isSystem = theme === 'system' || theme === null;
  const userTheme = isSystem ? systemTheme : theme;

  const isDark = userTheme === 'dark';
  const updateTheme = () => setTheme(isDark ? 'light' : 'dark');

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={updateTheme}
      className={forceDisplay ? 'flex-none' : 'hidden flex-none md:flex'}
    >
      <Sun className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

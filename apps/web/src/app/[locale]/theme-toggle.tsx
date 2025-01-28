'use client';

import { Button } from '@repo/ui/components/ui/button';
import { cn } from '@repo/ui/lib/utils';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeToggle({
  forceDisplay = false,
  className,
}: {
  forceDisplay?: boolean;
  className?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();

  const isDark = resolvedTheme === 'dark';
  const updateTheme = () => setTheme(isDark ? 'light' : 'dark');

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={updateTheme}
      className={cn(
        forceDisplay ? 'flex-none' : 'hidden flex-none md:flex',
        className
      )}
    >
      <Sun className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

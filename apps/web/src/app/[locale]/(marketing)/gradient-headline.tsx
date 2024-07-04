'use client';

import { cn } from '@repo/ui/lib/utils';
import { useTheme } from 'next-themes';
import { ReactNode } from 'react';

export default function GradientHeadline({
  title,
  children,
  className,
}: {
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme?.includes('dark');

  return (
    <span
      className={cn(
        `${
          isDark
            ? 'from-pink-300 via-amber-300 to-blue-300'
            : 'from-pink-500 via-yellow-500 to-sky-600 dark:from-pink-300 dark:via-amber-300 dark:to-blue-300'
        } bg-gradient-to-r bg-clip-text py-1 text-transparent`,
        className
      )}
    >
      {title || children}
    </span>
  );
}

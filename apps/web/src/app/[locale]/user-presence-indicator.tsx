'use client';

import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { ReactNode } from 'react';

export default function UserPresenceIndicator({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const isDefault = !resolvedTheme?.includes('-');

  return (
    <div
      className={cn(
        'border-background absolute bottom-0 right-0 z-20 h-2 w-2 rounded-full border',
        isDefault ? 'bg-green-500 dark:bg-green-400' : 'bg-foreground',
        className
      )}
    >
      {children}
    </div>
  );
}

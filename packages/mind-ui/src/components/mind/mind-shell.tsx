'use client';

import { cn } from '@tuturuuu/utils/format';
import type { CSSProperties, ReactNode } from 'react';

type MindShellProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function MindShell({ children, className, style }: MindShellProps) {
  return (
    <main
      className={cn(
        'dashboard-embed-shell relative flex min-h-0 flex-col overflow-hidden text-foreground',
        className
      )}
      style={style}
    >
      {children}
    </main>
  );
}

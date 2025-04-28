'use client';

import { cn } from '@tuturuuu/utils/format';
import { ReactNode } from 'react';

export default function UserPresenceIndicator({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'border-background absolute bottom-0 right-0 z-20 h-2 w-2 rounded-full border',
        'bg-dynamic-green',
        className
      )}
    >
      {children}
    </div>
  );
}

'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

export default function GradientHeadline({
  title,
  children,
  className,
}: {
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'bg-linear-to-r from-orange-500 via-amber-500 to-yellow-500 bg-clip-text py-1 text-transparent dark:from-dynamic-light-red dark:via-dynamic-light-pink dark:to-dynamic-light-blue',
        className
      )}
    >
      {title || children}
    </span>
  );
}

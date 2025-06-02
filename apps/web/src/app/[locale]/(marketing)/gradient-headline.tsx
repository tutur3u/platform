'use client';

import { cn } from '@tuturuuu/utils/format';
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
  return (
    <span
      className={cn(
        'from-dynamic-red via-dynamic-yellow to-dynamic-blue bg-gradient-to-r bg-clip-text py-1 text-transparent',
        className
      )}
    >
      {title || children}
    </span>
  );
}

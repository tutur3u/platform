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
        'from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-gradient-to-r bg-clip-text py-1 text-transparent',
        className
      )}
    >
      {title || children}
    </span>
  );
}

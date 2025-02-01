'use client';

import { cn } from '@repo/ui/lib/utils';
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
        'bg-gradient-to-r from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-clip-text py-1 text-transparent',
        className
      )}
    >
      {title || children}
    </span>
  );
}

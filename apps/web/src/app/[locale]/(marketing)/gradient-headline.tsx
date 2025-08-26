'use client';

import { cn } from '@ncthub/utils/format';
import { ReactNode } from 'react';

type GradientVariant = 'red-blue' | 'yellow-orange';

const gradientClasses: Record<GradientVariant, string> = {
  'red-blue':
    'bg-linear-to-r from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue',
  'yellow-orange':
    'bg-linear-to-r from-dynamic-light-yellow via-dynamic-light-orange  to-dynamic-light-orange',
};

export default function GradientHeadline({
  title,
  children,
  className,
  gradient = 'red-blue',
}: {
  title?: string;
  children?: ReactNode;
  className?: string;
  gradient?: GradientVariant;
}) {
  return (
    <span
      className={cn(
        'bg-clip-text py-1 text-transparent',
        gradientClasses[gradient],
        className
      )}
    >
      {title || children}
    </span>
  );
}

'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Timer } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';

interface TaskEstimationDisplayProps {
  points: number | null | undefined;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function TaskEstimationDisplay({
  points,
  className,
  showIcon = true,
  size = 'sm',
}: TaskEstimationDisplayProps) {
  if (!points) return null;

  const sizeClasses = {
    sm: 'h-5 px-1.5 py-0.5 text-[10px]',
    md: 'h-6 px-2 py-1 text-xs',
    lg: 'h-7 px-2.5 py-1.5 text-sm',
  };

  const iconSizes = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-3.5 w-3.5',
  };

  return (
    <Badge
      variant="secondary"
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        'border-blue-200 bg-blue-50 text-blue-700',
        'dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
        sizeClasses[size],
        className
      )}
    >
      {showIcon && <Timer className={iconSizes[size]} />}
      {points}
    </Badge>
  );
}

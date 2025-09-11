'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Tag } from '@tuturuuu/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';

interface TaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface TaskLabelsDisplayProps {
  labels: TaskLabel[] | undefined | null;
  maxDisplay?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export function TaskLabelsDisplay({
  labels,
  maxDisplay = 2,
  className,
  size = 'sm',
  showIcon = false,
}: TaskLabelsDisplayProps) {
  if (!labels || labels.length === 0) return null;

  const visibleLabels = labels.slice(0, maxDisplay);
  const hiddenCount = Math.max(0, labels.length - maxDisplay);

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

  const getColorClasses = (color: string) => {
    // Map color names to Tailwind classes
    const colorMap: Record<string, string> = {
      red: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
      orange:
        'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800',
      yellow:
        'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800',
      green:
        'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
      blue: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
      indigo:
        'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-800',
      purple:
        'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800',
      pink: 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800',
      gray: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800',
    };

    return colorMap[color] || colorMap.gray;
  };

  return (
    <div className={cn('flex items-center gap-1 overflow-hidden', className)}>
      {visibleLabels.map((label) => (
        <Badge
          key={label.id}
          variant="outline"
          className={cn(
            'inline-flex items-center gap-1 truncate border font-medium',
            getColorClasses(label.color),
            sizeClasses[size]
          )}
        >
          {showIcon && <Tag className={iconSizes[size]} />}
          <span className="truncate">{label.name}</span>
        </Badge>
      ))}

      {hiddenCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                'inline-flex items-center font-medium',
                'border-gray-200 bg-gray-100 text-gray-600',
                'dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400',
                sizeClasses[size]
              )}
            >
              +{hiddenCount}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium text-xs">Hidden labels:</p>
              {labels.slice(maxDisplay).map((label) => (
                <div key={label.id} className="text-xs">
                  {label.name}
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

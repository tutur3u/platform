'use client';

import { Tag } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTheme } from 'next-themes';
import { computeAccessibleLabelStyles } from '../utils/label-colors';

interface TaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface TaskLabelsDisplayProps {
  labels: TaskLabel[] | undefined | null;
  maxDisplay?: number; // Optional: limit display count, shows all by default
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  /** Localized label for "Hidden Labels" tooltip. Useful when rendered outside NextIntlProvider context (e.g., createRoot). */
  hiddenLabelsLabel?: string;
}

export function TaskLabelsDisplay({
  labels,
  maxDisplay,
  className,
  size = 'sm',
  showIcon = true,
  hiddenLabelsLabel = 'Hidden Labels',
}: TaskLabelsDisplayProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  if (!labels || labels.length === 0) return null;

  // Derive sizing tokens
  const sizeClasses = {
    sm: 'h-5.5 px-1 text-[10px]',
    md: 'h-6 px-2 text-xs',
    lg: 'h-7 px-2.5 text-sm',
  } as const;
  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  } as const;

  const visibleLabels = maxDisplay ? labels.slice(0, maxDisplay) : labels;
  const hiddenCount = maxDisplay ? Math.max(0, labels.length - maxDisplay) : 0;

  return (
    <div className={cn('flex items-center gap-1 overflow-hidden', className)}>
      {visibleLabels.map((label) => {
        const styles = computeAccessibleLabelStyles(label.color, isDark);
        return (
          <Badge
            key={label.id}
            variant="outline"
            className={cn(
              'inline-flex items-center gap-1 truncate border font-medium ring-0',
              sizeClasses[size]
            )}
            style={
              styles
                ? {
                    backgroundColor: styles.bg,
                    borderColor: styles.border,
                    color: styles.text,
                  }
                : undefined
            }
          >
            {showIcon && <Tag className={iconSizes[size]} />}
            <span className="truncate">{label.name}</span>
          </Badge>
        );
      })}
      {hiddenCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                'inline-flex items-center border-dashed font-medium opacity-80',
                sizeClasses[size]
              )}
            >
              +{hiddenCount}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium text-xs">{hiddenLabelsLabel}</p>
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

'use client';

import { Tag } from '@tuturuuu/icons';
import type { TaskLabel as DbTaskLabel } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { computeAccessibleLabelStyles } from '../utils/label-colors';

export type TaskLabel = Pick<DbTaskLabel, 'id' | 'name' | 'color'> & {
  created_at?: DbTaskLabel['created_at'];
};

interface LabelChipProps {
  label: TaskLabel;
  className?: string;
  showIcon?: boolean;
  isDark?: boolean;
}

export function LabelChip({
  label,
  className,
  showIcon = true,
  isDark,
}: LabelChipProps) {
  const styles = computeAccessibleLabelStyles(label.color, isDark);
  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1 border font-medium ring-0',
        className
      )}
      style={
        styles
          ? {
              backgroundColor: styles.bg,
              borderColor: styles.border,
              color: styles.text,
            }
          : { backgroundColor: label.color }
      }
    >
      {showIcon && <Tag className="h-3 w-3 shrink-0" />}
      <span className="truncate">{label.name}</span>
    </Badge>
  );
}

'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';

interface TaskTagsDisplayProps {
  tags: string[];
  maxDisplay?: number;
  className?: string;
  onTagClick?: (tag: string) => void;
  clickable?: boolean;
}

export function TaskTagsDisplay({
  tags = [],
  maxDisplay = 3,
  className,
  onTagClick,
  clickable = false,
}: TaskTagsDisplayProps) {
  if (!tags || tags.length === 0) return null;

  const displayTags = tags.slice(0, maxDisplay);
  const remainingCount = tags.length - maxDisplay;

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {displayTags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className={cn(
            'h-auto px-1.5 py-0.5 text-xs',
            clickable &&
              'cursor-pointer transition-colors hover:bg-secondary/80'
          )}
          onClick={() => clickable && onTagClick?.(tag)}
        >
          {tag}
        </Badge>
      ))}
      {remainingCount > 0 && (
        <Badge
          variant="outline"
          className="h-auto px-1.5 py-0.5 text-muted-foreground text-xs"
        >
          +{remainingCount}
        </Badge>
      )}
    </div>
  );
}

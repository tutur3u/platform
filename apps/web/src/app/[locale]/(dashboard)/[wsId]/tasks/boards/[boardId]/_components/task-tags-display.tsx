'use client';

import { Badge } from '@tuturuuu/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { getTagColor } from '@/lib/tag-utils';

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
  const hasHiddenTags = remainingCount > 0;

  return (
    <TooltipProvider>
      <div className={cn('flex flex-wrap gap-1.5', className)}>
        {displayTags.map((tag) => (
          <Badge
            key={tag}
            variant="outline"
            className={cn(
              'h-auto rounded-full border px-2 py-0.5 font-medium text-xs',
              'transition-all duration-200 hover:scale-105',
              getTagColor(tag),
              clickable && 'cursor-pointer hover:brightness-110'
            )}
            onClick={() => clickable && onTagClick?.(tag)}
          >
            #{tag}
          </Badge>
        ))}
        {hasHiddenTags && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="h-auto cursor-help rounded-full border px-2 py-0.5 font-medium text-muted-foreground text-xs hover:bg-muted/50"
              >
                +{remainingCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-2">
                <p className="font-medium text-xs">All tags:</p>
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className={cn(
                        'h-auto rounded-full border px-2 py-0.5 font-medium text-xs',
                        getTagColor(tag)
                      )}
                    >
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

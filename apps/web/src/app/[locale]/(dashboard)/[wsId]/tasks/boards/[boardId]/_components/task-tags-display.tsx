'use client';

import { getTagColorStyling } from '@/lib/tag-utils';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
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
  const hasHiddenTags = remainingCount > 0;
  const needsScroll = tags.length >= 10;

  return (
    <TooltipProvider>
      <div className={cn('flex flex-wrap gap-1.5', className)}>
        {displayTags.map((tag) => {
          const { style, className: tagClassName } = getTagColorStyling(tag);
          return (
            <Badge
              key={tag}
              variant="outline"
              className={cn(
                'h-auto rounded-full border px-2 py-0.5 text-xs font-medium',
                'transition-all duration-200 hover:scale-105',
                'max-w-[120px] truncate',
                tagClassName,
                clickable && 'cursor-pointer hover:brightness-110'
              )}
              style={style}
              onClick={() => clickable && onTagClick?.(tag)}
              title={tag.length > 15 ? `#${tag}` : undefined}
            >
              #{tag}
            </Badge>
          );
        })}
        {hasHiddenTags && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="h-auto cursor-help rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:scale-105 hover:bg-muted/50"
              >
                +{remainingCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className={cn('max-w-sm p-0', needsScroll && 'max-h-64')}
              sideOffset={8}
            >
              <div className="space-y-3 p-4">
                <p className="text-sm font-medium text-foreground">All tags:</p>
                <div
                  className={cn(
                    'flex flex-wrap gap-1.5',
                    needsScroll && 'max-h-48 overflow-y-auto pr-2'
                  )}
                >
                  {tags.map((tag) => {
                    const { style, className: tagClassName } =
                      getTagColorStyling(tag);
                    return (
                      <Badge
                        key={tag}
                        variant="outline"
                        className={cn(
                          'h-auto rounded-full border px-2 py-0.5 text-xs font-medium',
                          'max-w-[140px] truncate transition-all duration-200',
                          'hover:scale-105 hover:brightness-110',
                          tagClassName
                        )}
                        style={style}
                        title={tag.length > 18 ? `#${tag}` : undefined}
                      >
                        #{tag}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

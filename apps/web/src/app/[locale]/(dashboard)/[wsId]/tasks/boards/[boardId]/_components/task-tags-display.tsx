'use client';

import { Badge } from '@tuturuuu/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { getTagColorStyling } from '@/lib/tag-utils';

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
                'h-auto min-w-0 max-w-[80px] overflow-hidden rounded-full border px-1.5 py-0.5 font-medium text-[10px] truncate transition-all duration-200 hover:scale-105',
                tagClassName,
                clickable && 'cursor-pointer hover:brightness-110'
              )}
              style={style}
              onClick={() => clickable && onTagClick?.(tag)}
              title={tag.length > 15 ? `#${tag}` : undefined}
            >
              <span className="truncate overflow-hidden whitespace-nowrap w-full block">#{tag}</span>
            </Badge>
          );
        })}
        {hasHiddenTags && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="border border-primary/30 bg-primary/10 px-2 py-0.5 rounded-full font-semibold text-primary transition-all duration-200 hover:bg-primary/20"
              >
                +{remainingCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className={cn('bg-gray-900/80 text-white rounded-2xl p-5 shadow-2xl border border-white/10 backdrop-blur-lg transition-all duration-200', needsScroll && 'max-h-64')}
              sideOffset={8}
            >
              <div className="space-y-3 p-4">
                <p className="text-sm font-semibold text-gray-200">All tags:</p>
                <hr className="my-3 border-white/10" />
                <div
                  className={cn(
                    'flex flex-wrap gap-2 justify-start',
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
                          'h-auto max-w-[110px] rounded-full border px-2 py-0.5 font-medium text-xs transition-all duration-200 hover:scale-105 hover:brightness-110',
                          tagClassName
                        )}
                        style={style}
                        title={tag.length > 18 ? `#${tag}` : undefined}
                      >
                        <span className="truncate overflow-hidden whitespace-nowrap w-full block">#{tag}</span>
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
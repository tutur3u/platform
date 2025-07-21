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
                'block border font-medium h-auto max-w-[80px] min-w-0 overflow-hidden px-1.5 py-0.5 rounded-full text-[10px] transition-all truncate duration-200 hover:scale-105',
                tagClassName,
                clickable && 'cursor-pointer hover:brightness-110'
              )}
              style={style}
              onClick={() => clickable && onTagClick?.(tag)}
              title={tag.length > 15 ? `#${tag}` : undefined}
            >
              <span className="block overflow-hidden truncate whitespace-nowrap w-full">#{tag}</span>
            </Badge>
          );
        })}
        {hasHiddenTags && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="bg-primary/10 border border-primary/30 font-semibold px-2 py-0.5 rounded-full text-primary transition-all duration-200 hover:bg-primary/20"
              >
                +{remainingCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className={cn('backdrop-blur-lg bg-gray-900/80 border border-white/10 p-5 rounded-2xl shadow-2xl text-white transition-all duration-200', needsScroll && 'max-h-64')}
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
                          'block border font-medium h-auto max-w-[110px] rounded-full px-2 py-0.5 text-xs transition-all duration-200 hover:brightness-110 hover:scale-105',
                          tagClassName
                        )}
                        style={style}
                        title={tag.length > 18 ? `#${tag}` : undefined}
                      >
                        <span className="block overflow-hidden truncate whitespace-nowrap w-full">#{tag}</span>
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
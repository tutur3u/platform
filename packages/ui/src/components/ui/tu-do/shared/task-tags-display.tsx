'use client';

import { Badge } from '@tuturuuu/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { getTagColorStyling } from '@tuturuuu/utils/tag-utils';

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
                'block h-auto min-w-0 max-w-[80px] overflow-hidden truncate rounded-full border px-1.5 py-0.5 font-medium text-[10px] transition-all duration-200 hover:scale-105',
                tagClassName,
                clickable && 'cursor-pointer hover:brightness-110'
              )}
              style={style}
              onClick={() => clickable && onTagClick?.(tag)}
              title={tag.length > 15 ? `#${tag}` : undefined}
            >
              <span className="block w-full overflow-hidden truncate whitespace-nowrap">
                #{tag}
              </span>
            </Badge>
          );
        })}
        {hasHiddenTags && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-semibold text-primary transition-all duration-200 hover:bg-primary/20"
              >
                +{remainingCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className={cn(
                'rounded-2xl border border-white/10 bg-gray-900/80 p-5 text-white shadow-2xl backdrop-blur-lg transition-all duration-200',
                needsScroll && 'max-h-64'
              )}
              sideOffset={8}
            >
              <div className="space-y-3 p-4">
                <p className="font-semibold text-gray-200 text-sm">All tags:</p>
                <hr className="my-3 border-white/10" />
                <div
                  className={cn(
                    'flex flex-wrap justify-start gap-2',
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
                          'block h-auto max-w-[110px] rounded-full border px-2 py-0.5 font-medium text-xs transition-all duration-200 hover:scale-105 hover:brightness-110',
                          tagClassName
                        )}
                        style={style}
                        title={tag.length > 18 ? `#${tag}` : undefined}
                      >
                        <span className="block w-full overflow-hidden truncate whitespace-nowrap">
                          #{tag}
                        </span>
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

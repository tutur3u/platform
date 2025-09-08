'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { Filter, Tag, X } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { getTagColorStyling } from '@tuturuuu/utils/tag-utils';
import { useBoardTaskTags } from '@tuturuuu/utils/task-helper';
import { useState } from 'react';

interface TagFilterProps {
  boardId: string;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  className?: string;
}

export function TagFilter({
  boardId,
  selectedTags,
  onTagsChange,
  className,
}: TagFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    data: availableTags = [],
    isLoading,
    error,
  } = useBoardTaskTags(boardId);
  const { toast } = useToast();

  // Ensure availableTags is always an array
  const tags = Array.isArray(availableTags) ? availableTags : [];

  const handleTagToggle = (tag: string) => {
    const newSelectedTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];

    onTagsChange(newSelectedTags);

    if (!selectedTags.includes(tag)) {
      toast({
        title: 'Filter applied',
        description: `Showing tasks with tag "${tag}"`,
      });
    }
  };

  const clearAllFilters = () => {
    onTagsChange([]);
    toast({
      title: 'Filters cleared',
      description: 'Showing all tasks',
    });
  };

  const hasActiveFilters = selectedTags.length > 0;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Filtered by:</span>
          {selectedTags.map((tag) => {
            const { style, className: tagClassName } = getTagColorStyling(tag);
            return (
              <Badge
                key={tag}
                variant="outline"
                className={cn(
                  'flex h-6 items-center gap-1 rounded-full border px-2 py-1 font-medium text-xs',
                  tagClassName
                )}
                style={style}
              >
                <Tag className="h-3 w-3" />
                {tag}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-destructive/20 hover:text-destructive"
                  onClick={() => handleTagToggle(tag)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-muted-foreground text-xs hover:text-foreground"
            onClick={clearAllFilters}
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Tag Filter Dropdown */}
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={hasActiveFilters ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'h-8 gap-1.5',
              hasActiveFilters && 'bg-primary text-primary-foreground'
            )}
          >
            <Filter className="h-3 w-3" />
            <span className="text-xs">
              {hasActiveFilters
                ? `${selectedTags.length} filter${selectedTags.length > 1 ? 's' : ''}`
                : 'Filter by tags'}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Filter by Tags
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {isLoading && (
            <DropdownMenuItem disabled className="text-muted-foreground">
              Loading tags...
            </DropdownMenuItem>
          )}

          {error && (
            <DropdownMenuItem disabled className="text-destructive">
              Error loading tags
            </DropdownMenuItem>
          )}

          {!isLoading && !error && tags.length === 0 && (
            <DropdownMenuItem disabled className="text-muted-foreground">
              No tags available
            </DropdownMenuItem>
          )}

          {!isLoading && !error && tags.length > 0 && (
            <DropdownMenuGroup>
              {tags.map((tag: string) => {
                const { style, className: tagClassName } =
                  getTagColorStyling(tag);
                return (
                  <DropdownMenuItem
                    key={tag}
                    onClick={() => handleTagToggle(tag)}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <div
                      className={cn(
                        'h-3 w-3 rounded-full border',
                        selectedTags.includes(tag)
                          ? tagClassName
                          : 'border-muted-foreground/30'
                      )}
                      style={style}
                    />
                    <span className="flex-1">{tag}</span>
                    {selectedTags.includes(tag) && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'h-5 rounded-full border px-1.5 font-medium text-xs',
                          tagClassName
                        )}
                        style={style}
                      >
                        Active
                      </Badge>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          )}

          {hasActiveFilters && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={clearAllFilters}
                className="cursor-pointer text-destructive"
              >
                <X className="mr-2 h-4 w-4" />
                Clear all filters
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

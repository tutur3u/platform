'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { Check, Filter, X } from '@tuturuuu/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

interface TaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface Props {
  wsId: string;
  selectedLabels: TaskLabel[];
  onLabelsChange: (labels: TaskLabel[]) => void;
}

function getColorStyles(color: string) {
  // If it's a hex color, use luminance-based calculations
  if (color.startsWith('#') || color.startsWith('rgb')) {
    // Parse hex color to RGB
    let r: number, g: number, b: number;

    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        r = parseInt((hex[0] || '0') + (hex[0] || '0'), 16);
        g = parseInt((hex[1] || '0') + (hex[1] || '0'), 16);
        b = parseInt((hex[2] || '0') + (hex[2] || '0'), 16);
      } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2) || '00', 16);
        g = parseInt(hex.substring(2, 4) || '00', 16);
        b = parseInt(hex.substring(4, 6) || '00', 16);
      } else {
        // Invalid hex format, fallback to CSS custom property
        return {
          backgroundColor: color,
          color: '#ffffff',
        };
      }
    } else if (color.startsWith('rgb')) {
      const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!match || match.length < 4) {
        return {
          backgroundColor: color,
          color: '#ffffff',
        };
      }
      r = Number(match[1]);
      g = Number(match[2]);
      b = Number(match[3]);
    } else {
      return {
        backgroundColor: color,
        color: '#ffffff',
      };
    }

    // Validate RGB values
    if (
      Number.isNaN(r) ||
      Number.isNaN(g) ||
      Number.isNaN(b) ||
      r < 0 ||
      r > 255 ||
      g < 0 ||
      g > 255 ||
      b < 0 ||
      b > 255
    ) {
      return {
        backgroundColor: color,
        color: '#ffffff',
      };
    }

    // Calculate relative luminance using sRGB formula
    const toLinear = (c: number) => {
      const normalized = c / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };

    const luminance =
      0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

    // Use white text for dark colors (luminance < 0.5), black for light colors
    const textColor = luminance < 0.5 ? '#ffffff' : '#000000';

    return {
      backgroundColor: color,
      color: textColor,
    };
  }

  // For CSS custom properties or other color formats, use the color directly
  return {
    backgroundColor: color,
    color: '#ffffff',
  };
}

export function LabelFilter({ wsId, selectedLabels, onLabelsChange }: Props) {
  const [open, setOpen] = useState(false);

  // Fetch available labels for the workspace
  const { data: availableLabels = [], isLoading } = useQuery({
    queryKey: ['workspace-labels', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/labels`);
      if (!response.ok) throw new Error('Failed to fetch labels');
      return response.json() as Promise<TaskLabel[]>;
    },
    enabled: !!wsId,
  });

  const handleLabelToggle = (label: TaskLabel) => {
    const isSelected = selectedLabels.some((l) => l.id === label.id);
    if (isSelected) {
      onLabelsChange(selectedLabels.filter((l) => l.id !== label.id));
    } else {
      onLabelsChange([...selectedLabels, label]);
    }
  };

  const clearAllFilters = () => {
    onLabelsChange([]);
  };

  const hasFilters = selectedLabels.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'h-6 gap-1 px-1.5 text-[10px] sm:h-7 sm:gap-1.5 sm:px-2 sm:text-xs',
              hasFilters && 'border-primary/50 bg-primary/5'
            )}
          >
            <Filter className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">Labels</span>
            {hasFilters && (
              <Badge variant="secondary" className="h-3.5 px-1 text-[9px] sm:h-4 sm:text-[10px]">
                {selectedLabels.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search labels..." className="h-9" />
            <CommandList>
              {isLoading && (
                <div className="p-2 text-center text-muted-foreground text-sm">
                  Loading...
                </div>
              )}
              {!isLoading && availableLabels.length === 0 && (
                <CommandEmpty>No labels found.</CommandEmpty>
              )}
              {!isLoading && availableLabels.length > 0 && (
                <CommandGroup>
                  {availableLabels.map((label) => {
                    const isSelected = selectedLabels.some(
                      (l) => l.id === label.id
                    );
                    return (
                      <CommandItem
                        key={label.id}
                        value={label.name}
                        onSelect={() => handleLabelToggle(label)}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            style={getColorStyles(label.color)}
                            className="border-0 text-xs"
                          >
                            {label.name}
                          </Badge>
                        </div>
                        {isSelected && <Check className="h-4 w-4" />}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Clear filters button */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground sm:h-7 sm:px-2 sm:text-xs"
        >
          <span className="hidden sm:inline">Clear</span>
          <X className="h-3 w-3 sm:ml-1" />
        </Button>
      )}

      {/* Selected labels display */}
      {hasFilters && (
        <div className="flex flex-wrap gap-1">
          {selectedLabels.map((label) => (
            <Badge
              key={label.id}
              style={getColorStyles(label.color)}
              className="h-5 cursor-pointer border-0 px-1.5 text-[10px] hover:opacity-80 sm:h-6 sm:px-2 sm:text-xs"
              onClick={() => handleLabelToggle(label)}
            >
              {label.name}
              <X className="ml-0.5 h-2.5 w-2.5 sm:ml-1 sm:h-3 sm:w-3" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

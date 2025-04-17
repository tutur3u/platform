// ColorPicker.tsx
'use client';

import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';

// Color map with display names and CSS classes - Added cbg to avoid other color problems
export const colorMap: Record<
  SupportedColor,
  {
    bg: string;
    cbg: string;
    activeBg: string;
    text: string;
    name: string;
  }
> = {
  RED: {
    bg: 'bg-calendar-bg-red ring-calendar-bg-red',
    cbg: 'bg-[var(--dynamic-red)]',
    activeBg: 'bg-dynamic-light-red ring-dynamic-light-red',
    text: 'text-dynamic-light-red',
    name: 'Red',
  },
  ORANGE: {
    bg: 'bg-calendar-bg-orange ring-calendar-bg-orange',
    cbg: 'bg-[var(--dynamic-orange)]',
    activeBg: 'bg-dynamic-light-orange ring-dynamic-light-orange',
    text: 'text-dynamic-light-orange',
    name: 'Orange',
  },
  YELLOW: {
    bg: 'bg-calendar-bg-yellow ring-calendar-bg-yellow',
    cbg: 'bg-[var(--dynamic-yellow)]',
    activeBg: 'bg-dynamic-light-yellow ring-dynamic-light-yellow',
    text: 'text-dynamic-light-yellow',
    name: 'Yellow',
  },
  GREEN: {
    bg: 'bg-calendar-bg-green ring-calendar-bg-green',
    cbg: 'bg-[var(--dynamic-green)]',
    activeBg: 'bg-dynamic-light-green ring-dynamic-light-green',
    text: 'text-dynamic-light-green',
    name: 'Green',
  },
  BLUE: {
    bg: 'bg-calendar-bg-blue ring-calendar-bg-blue',
    cbg: 'bg-[var(--dynamic-blue)]',
    activeBg: 'bg-dynamic-light-blue ring-dynamic-light-blue',
    text: 'text-dynamic-light-blue',
    name: 'Blue',
  },
  PURPLE: {
    bg: 'bg-calendar-bg-purple ring-calendar-bg-purple',
    cbg: 'bg-[var(--dynamic-purple)]',
    activeBg: 'bg-dynamic-light-purple ring-dynamic-light-purple',
    text: 'text-dynamic-light-purple',
    name: 'Purple',
  },
  PINK: {
    bg: 'bg-calendar-bg-pink ring-calendar-bg-pink',
    cbg: 'bg-[var(--dynamic-pink)]',
    activeBg: 'bg-dynamic-light-pink ring-dynamic-light-pink',
    text: 'text-dynamic-light-pink',
    name: 'Pink',
  },
  INDIGO: {
    bg: 'bg-calendar-bg-indigo ring-calendar-bg-indigo',
    cbg: 'bg-[var(--dynamic-indigo)]',
    activeBg: 'bg-dynamic-light-indigo ring-dynamic-light-indigo',
    text: 'text-dynamic-light-indigo',
    name: 'Indigo',
  },
  CYAN: {
    bg: 'bg-calendar-bg-cyan ring-calendar-bg-cyan',
    cbg: 'bg-[var(--dynamic-cyan)]',
    activeBg: 'bg-dynamic-light-cyan ring-dynamic-light-cyan',
    text: 'text-dynamic-light-cyan',
    name: 'Cyan',
  },
  GRAY: {
    bg: 'bg-calendar-bg-gray ring-calendar-bg-gray',
    cbg: 'bg-[var(--dynamic-gray)]',
    activeBg: 'bg-dynamic-light-gray ring-dynamic-light-gray',
    text: 'text-dynamic-light-gray',
    name: 'Gray',
  },
};

export type CategoryColor = {
  name: string;
  color: SupportedColor;
};

type ColorPickerProps = {
  value: SupportedColor;
  onChange: (color: SupportedColor) => void;
  size?: 'sm' | 'md' | 'lg';
  showTooltips?: boolean;
};

export function ColorPicker({
  value,
  onChange,
  size = 'md',
  showTooltips = true,
}: ColorPickerProps) {
  const sizeClasses = {
    sm: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(colorMap).map(([colorKey, colorInfo]) => {
        const isSelected = value === colorKey;
        const colorButton = (
          <button
            key={colorKey}
            type="button"
            className={cn(
              colorInfo.cbg,
              sizeClasses[size],
              'rounded-full transition-all hover:scale-110',
              isSelected
                ? 'shadow-md ring-2 ring-primary ring-offset-2 ring-offset-background'
                : 'hover:shadow-md'
            )}
            onClick={() => onChange(colorKey as SupportedColor)}
            aria-label={`Select ${colorInfo.name} color`}
          />
        );

        return showTooltips ? (
          <Tooltip key={colorKey}>
            <TooltipTrigger asChild>{colorButton}</TooltipTrigger>
            <TooltipContent side="bottom" className="px-2 py-1">
              {colorInfo.name}
            </TooltipContent>
          </Tooltip>
        ) : (
          colorButton
        );
      })}
    </div>
  );
}

type CategoryColorPickerProps = {
  category: CategoryColor;
  onChange: (category: CategoryColor) => void;
  compact?: boolean;
};

export function CategoryColorPicker({
  category,
  onChange,
  compact = true,
}: CategoryColorPickerProps) {
  return (
    <div
      className={cn(
        'flex items-center',
        compact ? 'gap-2' : 'justify-between py-2'
      )}
    >
      {!compact && <span className="text-sm">{category.name}</span>}
      <ColorPicker
        value={category.color}
        onChange={(color) => onChange({ ...category, color })}
        size={compact ? 'sm' : 'md'}
        showTooltips={!compact}
      />
    </div>
  );
}

'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Tag } from '@tuturuuu/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import type React from 'react';

interface TaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface TaskLabelsDisplayProps {
  labels: TaskLabel[] | undefined | null;
  maxDisplay?: number; // Optional: limit display count, shows all by default
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export function TaskLabelsDisplay({
  labels,
  maxDisplay,
  className,
  size = 'sm',
  showIcon = false,
}: TaskLabelsDisplayProps) {
  if (!labels || labels.length === 0) return null;

  // Show all labels by default, or respect maxDisplay if provided
  const visibleLabels = maxDisplay ? labels.slice(0, maxDisplay) : labels;
  const hiddenCount = maxDisplay ? Math.max(0, labels.length - maxDisplay) : 0;

  const sizeClasses = {
    sm: 'h-5 px-1.5 py-0.5 text-[10px]',
    md: 'h-6 px-2 py-1 text-xs',
    lg: 'h-7 px-2.5 py-1.5 text-sm',
  };

  const iconSizes = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-3.5 w-3.5',
  };

  const getColorStyles = (color: string) => {
    // Handle hex colors directly
    if (color.startsWith('#')) {
      // Auto-balance colors for visibility with proper contrast calculation
      const ensureVisibleColor = (hexColor: string, isDark: boolean) => {
        try {
          const hex = hexColor.replace('#', '').padEnd(6, '0');
          if (hex.length !== 6) return hexColor;

          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);

          if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b))
            return hexColor;

          // Calculate relative luminance using sRGB formula
          const getLuminance = (val: number) => {
            const norm = val / 255;
            return norm <= 0.03928
              ? norm / 12.92
              : ((norm + 0.055) / 1.055) ** 2.4;
          };
          const luminance =
            0.2126 * getLuminance(r) +
            0.7152 * getLuminance(g) +
            0.0722 * getLuminance(b);

          // Thresholds for readability
          const tooLight = luminance > 0.85;
          const tooDark = luminance < 0.15;

          let adjustedColor = hexColor;

          if (isDark && tooDark) {
            // In dark mode, brighten very dark colors
            const factor = 1.8;
            const newR = Math.min(255, Math.floor(r * factor));
            const newG = Math.min(255, Math.floor(g * factor));
            const newB = Math.min(255, Math.floor(b * factor));
            adjustedColor = `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
          } else if (!isDark && tooLight) {
            // In light mode, darken very light colors
            const factor = 0.6;
            const newR = Math.floor(r * factor);
            const newG = Math.floor(g * factor);
            const newB = Math.floor(b * factor);
            adjustedColor = `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
          }

          return adjustedColor;
        } catch {
          return hexColor; // Return original if parsing fails
        }
      };

      const lightBg = `${color}20`; // 12.5% opacity
      const lightBorder = `${color}40`; // 25% opacity
      const darkBg = ensureVisibleColor(color, true) + '30'; // 18.75% opacity
      const darkBorder = ensureVisibleColor(color, true) + '60'; // 37.5% opacity

      return {
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        color: color,
        style: {
          '--label-bg-light': lightBg,
          '--label-border-light': lightBorder,
          '--label-bg-dark': darkBg,
          '--label-border-dark': darkBorder,
        } as React.CSSProperties,
      };
    }

    // Fallback for named colors
    const colorMap: Record<string, string> = {
      red: '#ef4444',
      orange: '#f97316',
      yellow: '#eab308',
      green: '#22c55e',
      blue: '#3b82f6',
      indigo: '#6366f1',
      purple: '#a855f7',
      pink: '#ec4899',
      gray: '#6b7280',
    };

    const hexColor = colorMap[color.toLowerCase()] ?? colorMap.blue!;
    return getColorStyles(hexColor);
  };

  return (
    <div className={cn('flex items-center gap-1 overflow-hidden', className)}>
      {visibleLabels.map((label) => {
        const colorStyles = getColorStyles(label.color);
        return (
          <Badge
            key={label.id}
            variant="outline"
            className={cn(
              'inline-flex items-center gap-1 truncate border font-medium',
              sizeClasses[size]
            )}
            style={{
              backgroundColor: colorStyles.backgroundColor,
              borderColor: colorStyles.borderColor,
              color: colorStyles.color,
              ...colorStyles.style,
            }}
          >
            {showIcon && <Tag className={iconSizes[size]} />}
            <span className="truncate">{label.name}</span>
          </Badge>
        );
      })}

      {hiddenCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                'inline-flex items-center font-medium',
                'border-gray-200 bg-gray-100 text-gray-600',
                'dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400',
                sizeClasses[size]
              )}
            >
              +{hiddenCount}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium text-xs">Hidden labels:</p>
              {labels.slice(maxDisplay).map((label) => (
                <div key={label.id} className="text-xs">
                  {label.name}
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

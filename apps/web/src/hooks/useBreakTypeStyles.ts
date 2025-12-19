'use client';

import * as Icons from '@tuturuuu/icons';

/**
 * Break type color token type
 */
export type BreakColor = keyof typeof BREAK_COLOR_CLASSES;

type IconComponent = React.ComponentType<{ className?: string }>;

/**
 * Map break type color to dynamic color token
 */
export const getBreakTypeColor = (
  colorName: string | null | undefined
): BreakColor => {
  if (!colorName) return 'dynamic-blue';

  const colorMap: Record<string, BreakColor> = {
    RED: 'dynamic-red',
    BLUE: 'dynamic-blue',
    GREEN: 'dynamic-green',
    YELLOW: 'dynamic-yellow',
    ORANGE: 'dynamic-orange',
    PURPLE: 'dynamic-purple',
    PINK: 'dynamic-pink',
    INDIGO: 'dynamic-indigo',
    CYAN: 'dynamic-cyan',
    GRAY: 'dynamic-surface',
  };

  return colorMap[colorName.toUpperCase()] || 'dynamic-blue';
};

/**
 * Map break type color token to concrete Tailwind class strings
 */
export const BREAK_COLOR_CLASSES = {
  'dynamic-red': {
    border: 'border-dynamic-red/20',
    bg: 'bg-dynamic-red/5',
    text: 'text-dynamic-red',
    textMuted: 'text-dynamic-red/75',
    badgeBg: 'bg-dynamic-red/30',
    bgOpaque: 'bg-dynamic-red/10',
  },
  'dynamic-blue': {
    border: 'border-dynamic-blue/20',
    bg: 'bg-dynamic-blue/5',
    text: 'text-dynamic-blue',
    textMuted: 'text-dynamic-blue/75',
    badgeBg: 'bg-dynamic-blue/30',
    bgOpaque: 'bg-dynamic-blue/10',
  },
  'dynamic-green': {
    border: 'border-dynamic-green/20',
    bg: 'bg-dynamic-green/5',
    text: 'text-dynamic-green',
    textMuted: 'text-dynamic-green/75',
    badgeBg: 'bg-dynamic-green/30',
    bgOpaque: 'bg-dynamic-green/10',
  },
  'dynamic-yellow': {
    border: 'border-dynamic-yellow/20',
    bg: 'bg-dynamic-yellow/5',
    text: 'text-dynamic-yellow',
    textMuted: 'text-dynamic-yellow/75',
    badgeBg: 'bg-dynamic-yellow/30',
    bgOpaque: 'bg-dynamic-yellow/10',
  },
  'dynamic-orange': {
    border: 'border-dynamic-orange/20',
    bg: 'bg-dynamic-orange/5',
    text: 'text-dynamic-orange',
    textMuted: 'text-dynamic-orange/75',
    badgeBg: 'bg-dynamic-orange/30',
    bgOpaque: 'bg-dynamic-orange/10',
  },
  'dynamic-purple': {
    border: 'border-dynamic-purple/20',
    bg: 'bg-dynamic-purple/5',
    text: 'text-dynamic-purple',
    textMuted: 'text-dynamic-purple/75',
    badgeBg: 'bg-dynamic-purple/30',
    bgOpaque: 'bg-dynamic-purple/10',
  },
  'dynamic-pink': {
    border: 'border-dynamic-pink/20',
    bg: 'bg-dynamic-pink/5',
    text: 'text-dynamic-pink',
    textMuted: 'text-dynamic-pink/75',
    badgeBg: 'bg-dynamic-pink/30',
    bgOpaque: 'bg-dynamic-pink/10',
  },
  'dynamic-indigo': {
    border: 'border-dynamic-indigo/20',
    bg: 'bg-dynamic-indigo/5',
    text: 'text-dynamic-indigo',
    textMuted: 'text-dynamic-indigo/75',
    badgeBg: 'bg-dynamic-indigo/30',
    bgOpaque: 'bg-dynamic-indigo/10',
  },
  'dynamic-cyan': {
    border: 'border-dynamic-cyan/20',
    bg: 'bg-dynamic-cyan/5',
    text: 'text-dynamic-cyan',
    textMuted: 'text-dynamic-cyan/75',
    badgeBg: 'bg-dynamic-cyan/30',
    bgOpaque: 'bg-dynamic-cyan/10',
  },
  'dynamic-surface': {
    border: 'border-dynamic-surface/20',
    bg: 'bg-dynamic-surface/5',
    text: 'text-dynamic-surface',
    textMuted: 'text-dynamic-surface/75',
    badgeBg: 'bg-dynamic-surface/30',
    bgOpaque: 'bg-dynamic-surface/10',
  },
} as const;

/**
 * Get icon component by name
 */
export const getIconComponent = (
  iconName: string | null | undefined
): IconComponent => {
  if (!iconName) return Icons.Coffee;

  const iconKey = iconName.charAt(0).toUpperCase() + iconName.slice(1);
  const IconComponent = (Icons as unknown as Record<string, IconComponent>)[
    iconKey
  ];

  return IconComponent || Icons.Coffee;
};

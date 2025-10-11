import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';

/**
 * Default color for new labels
 */
export const NEW_LABEL_COLOR = '#3b82f6';

/**
 * Priority labels for display
 */
export const PRIORITY_LABELS: Record<NonNullable<Task['priority']>, string> = {
  critical: 'Urgent',
  high: 'High',
  normal: 'Medium',
  low: 'Low',
};

/**
 * Color mappings for task list colors
 */
export const LIST_COLOR_CLASSES: Record<SupportedColor, string> = {
  GRAY: 'border-dynamic-gray/70 bg-dynamic-gray/5',
  RED: 'border-dynamic-red/70 bg-dynamic-red/5',
  BLUE: 'border-dynamic-blue/70 bg-dynamic-blue/5',
  GREEN: 'border-dynamic-green/70 bg-dynamic-green/5',
  YELLOW: 'border-dynamic-yellow/70 bg-dynamic-yellow/5',
  ORANGE: 'border-dynamic-orange/70 bg-dynamic-orange/5',
  PURPLE: 'border-dynamic-purple/70 bg-dynamic-purple/5',
  PINK: 'border-dynamic-pink/70 bg-dynamic-pink/5',
  INDIGO: 'border-dynamic-indigo/70 bg-dynamic-indigo/5',
  CYAN: 'border-dynamic-cyan/70 bg-dynamic-cyan/5',
};

/**
 * Priority border colors
 */
export const PRIORITY_BORDER_COLORS: Record<
  NonNullable<Task['priority']>,
  string
> = {
  critical: 'border-dynamic-red shadow-sm shadow-dynamic-red/20',
  high: 'border-dynamic-orange/70',
  normal: 'border-dynamic-yellow/70',
  low: 'border-dynamic-blue/70',
};

/**
 * Priority badge colors
 */
export const PRIORITY_BADGE_COLORS: Record<
  NonNullable<Task['priority']>,
  string
> = {
  critical:
    'bg-dynamic-red/20 border-dynamic-red/50 text-dynamic-red shadow-sm shadow-dynamic-red/50',
  high: 'bg-dynamic-orange/10 border-dynamic-orange/30 text-dynamic-orange',
  normal: 'bg-dynamic-yellow/10 border-dynamic-yellow/30 text-dynamic-yellow',
  low: 'bg-dynamic-blue/10 border-dynamic-blue/30 text-dynamic-blue',
};

/**
 * Destination tone colors for drag overlay
 */
export const DESTINATION_TONE_COLORS: Record<SupportedColor, string> = {
  GRAY: 'bg-dynamic-gray/15 text-foreground/80 ring-dynamic-gray/30',
  RED: 'bg-dynamic-red/15 text-dynamic-red ring-dynamic-red/30',
  BLUE: 'bg-dynamic-blue/15 text-dynamic-blue ring-dynamic-blue/30',
  GREEN: 'bg-dynamic-green/15 text-dynamic-green ring-dynamic-green/30',
  YELLOW: 'bg-dynamic-yellow/15 text-dynamic-yellow ring-dynamic-yellow/30',
  ORANGE: 'bg-dynamic-orange/15 text-dynamic-orange ring-dynamic-orange/30',
  PURPLE: 'bg-dynamic-purple/15 text-dynamic-purple ring-dynamic-purple/30',
  PINK: 'bg-dynamic-pink/15 text-dynamic-pink ring-dynamic-pink/30',
  INDIGO: 'bg-dynamic-indigo/15 text-dynamic-indigo ring-dynamic-indigo/30',
  CYAN: 'bg-dynamic-cyan/15 text-dynamic-cyan ring-dynamic-cyan/30',
};

/**
 * Default guard time for menu interactions (ms)
 */
export const MENU_GUARD_TIME = 300;

/**
 * Draft auto-save debounce time (ms)
 */
export const DRAFT_SAVE_DEBOUNCE = 300;

/**
 * Suggestion menu width (px)
 */
export const SUGGESTION_MENU_WIDTH = 360;

/**
 * Mobile breakpoint (px)
 */
export const MOBILE_BREAKPOINT = 768;

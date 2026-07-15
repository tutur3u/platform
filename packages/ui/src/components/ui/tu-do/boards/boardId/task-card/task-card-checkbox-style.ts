import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { cn } from '@tuturuuu/utils/format';
import { getListColorClasses } from '../../../utils/taskColorUtils';

const CHECKED_LIST_TONE_CLASSES: Record<SupportedColor, string> = {
  BLUE: 'data-[state=checked]:border-dynamic-blue/70 data-[state=checked]:bg-dynamic-blue/20 data-[state=checked]:text-dynamic-blue',
  CYAN: 'data-[state=checked]:border-dynamic-cyan/70 data-[state=checked]:bg-dynamic-cyan/20 data-[state=checked]:text-dynamic-cyan',
  GRAY: 'data-[state=checked]:border-dynamic-gray/70 data-[state=checked]:bg-dynamic-gray/20 data-[state=checked]:text-foreground',
  GREEN:
    'data-[state=checked]:border-dynamic-green/70 data-[state=checked]:bg-dynamic-green/20 data-[state=checked]:text-dynamic-green',
  INDIGO:
    'data-[state=checked]:border-dynamic-indigo/70 data-[state=checked]:bg-dynamic-indigo/20 data-[state=checked]:text-dynamic-indigo',
  ORANGE:
    'data-[state=checked]:border-dynamic-orange/70 data-[state=checked]:bg-dynamic-orange/20 data-[state=checked]:text-dynamic-orange',
  PINK: 'data-[state=checked]:border-dynamic-pink/70 data-[state=checked]:bg-dynamic-pink/20 data-[state=checked]:text-dynamic-pink',
  PURPLE:
    'data-[state=checked]:border-dynamic-purple/70 data-[state=checked]:bg-dynamic-purple/20 data-[state=checked]:text-dynamic-purple',
  RED: 'data-[state=checked]:border-dynamic-red/70 data-[state=checked]:bg-dynamic-red/20 data-[state=checked]:text-dynamic-red',
  YELLOW:
    'data-[state=checked]:border-dynamic-yellow/70 data-[state=checked]:bg-dynamic-yellow/20 data-[state=checked]:text-dynamic-yellow',
};

const TASK_CARD_ICON_TONE_CLASSES: Record<SupportedColor, string> = {
  BLUE: 'text-dynamic-blue data-[state=unchecked]:border-dynamic-blue/70 data-[state=unchecked]:bg-dynamic-blue/5',
  CYAN: 'text-dynamic-cyan data-[state=unchecked]:border-dynamic-cyan/70 data-[state=unchecked]:bg-dynamic-cyan/5',
  GRAY: 'text-foreground data-[state=unchecked]:border-dynamic-gray/70 data-[state=unchecked]:bg-dynamic-gray/5',
  GREEN:
    'text-dynamic-green data-[state=unchecked]:border-dynamic-green/70 data-[state=unchecked]:bg-dynamic-green/5',
  INDIGO:
    'text-dynamic-indigo data-[state=unchecked]:border-dynamic-indigo/70 data-[state=unchecked]:bg-dynamic-indigo/5',
  ORANGE:
    'text-dynamic-orange data-[state=unchecked]:border-dynamic-orange/70 data-[state=unchecked]:bg-dynamic-orange/5',
  PINK: 'text-dynamic-pink data-[state=unchecked]:border-dynamic-pink/70 data-[state=unchecked]:bg-dynamic-pink/5',
  PURPLE:
    'text-dynamic-purple data-[state=unchecked]:border-dynamic-purple/70 data-[state=unchecked]:bg-dynamic-purple/5',
  RED: 'text-dynamic-red data-[state=unchecked]:border-dynamic-red/70 data-[state=unchecked]:bg-dynamic-red/5',
  YELLOW:
    'text-dynamic-yellow data-[state=unchecked]:border-dynamic-yellow/70 data-[state=unchecked]:bg-dynamic-yellow/5',
};

const SELECTED_CARD_TONE_CLASSES: Record<SupportedColor, string> = {
  BLUE: 'from-dynamic-blue/15 via-dynamic-blue/5 ring-dynamic-blue/55',
  CYAN: 'from-dynamic-cyan/15 via-dynamic-cyan/5 ring-dynamic-cyan/55',
  GRAY: 'from-dynamic-gray/15 via-dynamic-gray/5 ring-dynamic-gray/55',
  GREEN: 'from-dynamic-green/15 via-dynamic-green/5 ring-dynamic-green/55',
  INDIGO: 'from-dynamic-indigo/15 via-dynamic-indigo/5 ring-dynamic-indigo/55',
  ORANGE: 'from-dynamic-orange/15 via-dynamic-orange/5 ring-dynamic-orange/55',
  PINK: 'from-dynamic-pink/15 via-dynamic-pink/5 ring-dynamic-pink/55',
  PURPLE: 'from-dynamic-purple/15 via-dynamic-purple/5 ring-dynamic-purple/55',
  RED: 'from-dynamic-red/15 via-dynamic-red/5 ring-dynamic-red/55',
  YELLOW: 'from-dynamic-yellow/15 via-dynamic-yellow/5 ring-dynamic-yellow/55',
};

export const TASK_CARD_SELECTION_CHECKBOX_BASE_CLASSES =
  'relative grid size-4 shrink-0 cursor-pointer place-items-center rounded-[4px] border-2 border-transparent bg-transparent shadow-sm outline-none transition-[background-color,border-color,box-shadow,color] duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/35 has-[:focus-visible]:ring-offset-1 has-[:focus-visible]:ring-offset-background data-[state=checked]:shadow-none hover:brightness-110';

export const TASK_CARD_SELECTED_STATE_BASE_CLASSES =
  'bg-linear-to-r to-transparent shadow-md ring-1 ring-inset';

export const TASK_CARD_OVERDUE_CHECKBOX_TONE_CLASSES =
  'border-dynamic-red/70 bg-dynamic-red/10 ring-1 ring-dynamic-red/20 data-[state=checked]:border-dynamic-red/70 data-[state=checked]:bg-dynamic-red/20 data-[state=checked]:text-dynamic-red';

export function getTaskCardCheckboxToneClasses(color?: SupportedColor | null) {
  return getListColorClasses(color ?? 'GRAY');
}

export function getTaskCardSelectionCheckboxToneClasses(
  color?: SupportedColor | null
) {
  const resolvedColor = color ?? 'GRAY';

  return cn(
    getTaskCardCheckboxToneClasses(resolvedColor),
    CHECKED_LIST_TONE_CLASSES[resolvedColor]
  );
}

export function getTaskCardSelectionIconToneClasses(
  color?: SupportedColor | null
) {
  return TASK_CARD_ICON_TONE_CLASSES[color ?? 'GRAY'];
}

export function getTaskCardSelectedStateToneClasses(
  color?: SupportedColor | null
) {
  return SELECTED_CARD_TONE_CLASSES[color ?? 'GRAY'];
}

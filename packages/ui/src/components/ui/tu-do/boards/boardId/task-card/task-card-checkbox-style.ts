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

export const TASK_CARD_SELECTION_CHECKBOX_BASE_CLASSES =
  'h-4 w-4 shrink-0 border-2 shadow-sm transition-all duration-200 hover:scale-110 hover:border-primary/50';

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

'use client';

import {
  BookOpen,
  Code2,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Repeat,
  ShieldPlus,
  SlidersHorizontal,
  Snowflake,
} from '@tuturuuu/icons';
import type {
  HabitTracker,
  HabitTrackerFieldSchema,
} from '@tuturuuu/types/primitives/HabitTracker';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { cn } from '@tuturuuu/utils/format';
import { HABIT_TRACKER_COLOR_CLASS_MAP } from '@/lib/habit-trackers/templates';

const ICON_MAP = {
  BookOpen,
  Code2,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Repeat,
  ShieldPlus,
  SlidersHorizontal,
  Snowflake,
};

const TRACKER_SOLID_CLASS_MAP: Record<SupportedColor, string> = {
  BLUE: 'bg-dynamic-blue',
  CYAN: 'bg-dynamic-cyan',
  GRAY: 'bg-dynamic-gray',
  GREEN: 'bg-dynamic-green',
  INDIGO: 'bg-dynamic-indigo',
  ORANGE: 'bg-dynamic-orange',
  PINK: 'bg-dynamic-pink',
  PURPLE: 'bg-dynamic-purple',
  RED: 'bg-dynamic-red',
  YELLOW: 'bg-dynamic-yellow',
};

export const ICON_OPTIONS = Object.keys(ICON_MAP) as Array<
  keyof typeof ICON_MAP
>;

export function TrackerIcon({
  icon,
  className,
}: {
  icon: HabitTracker['icon'];
  className?: string;
}) {
  const IconComponent = ICON_MAP[icon as keyof typeof ICON_MAP] ?? Repeat;

  return <IconComponent className={cn('h-5 w-5', className)} />;
}

export function getTrackerColorClasses(color: SupportedColor) {
  return HABIT_TRACKER_COLOR_CLASS_MAP[color];
}

export function getTrackerSolidClass(color: SupportedColor) {
  return TRACKER_SOLID_CLASS_MAP[color];
}

export function getPrimaryField(
  tracker: Pick<HabitTracker, 'input_schema' | 'primary_metric_key'>
) {
  return (
    tracker.input_schema.find(
      (field) => field.key === tracker.primary_metric_key
    ) ?? tracker.input_schema[0]
  );
}

export function formatCompactNumber(value: number) {
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 1,
      notation: 'compact',
    }).format(value);
  }

  return new Intl.NumberFormat().format(value);
}

export function slugifyFieldKey(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'value';
}

export function normalizeQuickAddValues(values: number[]) {
  return Array.from(
    new Set(
      values
        .filter((value) => Number.isFinite(value))
        .map((value) => Number(value))
        .filter((value) => value > 0)
    )
  ).sort((left, right) => left - right);
}

export function formatFieldValue(
  field: HabitTrackerFieldSchema | undefined,
  value: string | number | boolean | null | undefined
) {
  if (field?.type === 'boolean') {
    return value === true ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    const formatted = formatCompactNumber(value);
    return field?.unit ? `${formatted} ${field.unit}` : formatted;
  }

  return String(value ?? '');
}

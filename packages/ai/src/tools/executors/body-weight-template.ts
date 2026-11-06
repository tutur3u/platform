import type { HabitTrackerInput } from '@tuturuuu/types/primitives/HabitTracker';
import type { HabitLocale, WeightUnit } from './habit-helpers';

/**
 * Creation key for Mira's private Body Weight tracker. The Tasks API keeps at
 * most one active tracker per workspace creator and key, so concurrent first
 * logs converge on a single tracker.
 */
export const BODY_WEIGHT_CREATION_KEY = 'mira:body_weight';

const LABELS: Record<
  HabitLocale,
  { name: string; description: string; note: string }
> = {
  en: {
    name: 'Body Weight',
    description:
      'Log body weight with per-tracker units and a clean daily check-in.',
    note: 'Note',
  },
  vi: {
    name: 'Cân nặng',
    description:
      'Ghi cân nặng mỗi ngày với đơn vị riêng cho từng trình theo dõi.',
    note: 'Ghi chú',
  },
};

/**
 * Mirrors the Tasks `body_weight` template with labels in the user's language.
 * The Tasks satellite sanitises and validates the payload, so this stays
 * minimal.
 */
export function buildBodyWeightTrackerInput(
  unit: WeightUnit,
  locale: HabitLocale = 'en'
): HabitTrackerInput & { creation_key: string } {
  const labels = LABELS[locale];
  return {
    name: labels.name,
    description: labels.description,
    color: 'INDIGO',
    icon: 'SlidersHorizontal',
    tracking_mode: 'daily_summary',
    target_period: 'daily',
    target_operator: 'gte',
    target_value: unit === 'lb' ? 154 : 70,
    primary_metric_key: 'weight',
    aggregation_strategy: 'max',
    quick_add_values: [],
    input_schema: [
      {
        key: 'weight',
        label: labels.name,
        type: 'number',
        unit,
        required: true,
      },
      { key: 'note', label: labels.note, type: 'text' },
    ],
    freeze_allowance: 1,
    recovery_window_periods: 1,
    use_case: 'body_weight',
    template_category: 'health',
    composer_mode: 'measurement',
    composer_config: {
      unit,
      supported_units: ['kg', 'lb'],
      progress_variant: 'ring',
    },
    creation_key: BODY_WEIGHT_CREATION_KEY,
  };
}

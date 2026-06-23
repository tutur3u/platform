export type SpecialTaskListPin =
  | 'closed_tasks'
  | 'external_tasks'
  | 'overdue'
  | 'upcoming';

export const SPECIAL_TASK_LIST_PIN_VALUES: readonly SpecialTaskListPin[] = [
  'overdue',
  'upcoming',
  'external_tasks',
  'closed_tasks',
];

const SPECIAL_TASK_LIST_PIN_SET = new Set<string>(SPECIAL_TASK_LIST_PIN_VALUES);

export type SpecialTaskListPinState = Partial<
  Record<SpecialTaskListPin, boolean>
>;

export function parseSpecialTaskListPins(
  raw: string | null | undefined
): SpecialTaskListPinState {
  if (!raw) return {};

  const parseValues = (value: unknown) => {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SpecialTaskListPin => {
      return typeof item === 'string' && SPECIAL_TASK_LIST_PIN_SET.has(item);
    });
  };

  let values: SpecialTaskListPin[] = [];

  try {
    values = parseValues(JSON.parse(raw));
  } catch {
    values = parseValues(raw.split(',').map((item) => item.trim()));
  }

  return values.reduce<SpecialTaskListPinState>((acc, pin) => {
    acc[pin] = true;
    return acc;
  }, {});
}

export function serializeSpecialTaskListPins(
  state: SpecialTaskListPinState
): string | null {
  const pins = SPECIAL_TASK_LIST_PIN_VALUES.filter((pin) => state[pin]);
  return pins.length > 0 ? JSON.stringify(pins) : null;
}

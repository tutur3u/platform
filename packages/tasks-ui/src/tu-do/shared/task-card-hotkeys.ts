export const TASK_CARD_HOTKEYS_CONFIG_ID = 'TASK_CARD_HOTKEYS';
export const TASK_CARD_HOTKEY_EVENT = 'tuturuuu:task-card-hotkey';

export const TASK_CARD_HOTKEY_ACTIONS = [
  'priority',
  'labels',
  'estimation',
  'due_date',
  'projects',
  'assignees',
  'move',
] as const;

export type TaskCardHotkeyAction = (typeof TASK_CARD_HOTKEY_ACTIONS)[number];
export type TaskCardHotkeyBindings = Record<TaskCardHotkeyAction, string>;

export const DEFAULT_TASK_CARD_HOTKEYS: TaskCardHotkeyBindings = {
  priority: 'P',
  labels: 'L',
  estimation: 'E',
  due_date: 'D',
  projects: 'Shift+P',
  assignees: 'A',
  move: 'M',
};

const MODIFIER_KEYS = new Set(['Alt', 'Control', 'Meta', 'Shift']);

function normalizeKey(key: string) {
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function keyboardEventToTaskCardBinding(event: KeyboardEvent) {
  if (MODIFIER_KEYS.has(event.key)) return null;

  const keys: string[] = [];
  if (event.metaKey || event.ctrlKey) keys.push('Mod');
  if (event.altKey) keys.push('Alt');
  if (event.shiftKey) keys.push('Shift');
  keys.push(normalizeKey(event.key));
  return keys.join('+');
}

export function taskCardHotkeyMatches(event: KeyboardEvent, binding: string) {
  return Boolean(binding) && keyboardEventToTaskCardBinding(event) === binding;
}

export function isTaskCardHotkeyEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"]'
    )
  );
}

export function parseTaskCardHotkeyBindings(
  rawValue: string | null | undefined
): TaskCardHotkeyBindings {
  if (!rawValue) return DEFAULT_TASK_CARD_HOTKEYS;

  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    return Object.fromEntries(
      TASK_CARD_HOTKEY_ACTIONS.map((action) => [
        action,
        typeof parsed[action] === 'string'
          ? parsed[action]
          : DEFAULT_TASK_CARD_HOTKEYS[action],
      ])
    ) as TaskCardHotkeyBindings;
  } catch {
    return DEFAULT_TASK_CARD_HOTKEYS;
  }
}

export function serializeTaskCardHotkeyBindings(
  bindings: TaskCardHotkeyBindings
) {
  return JSON.stringify(bindings);
}

export function findTaskCardHotkeyConflict(
  bindings: TaskCardHotkeyBindings,
  action: TaskCardHotkeyAction,
  candidate: string
) {
  if (!candidate) return null;
  return (
    TASK_CARD_HOTKEY_ACTIONS.find(
      (otherAction) =>
        otherAction !== action && bindings[otherAction] === candidate
    ) ?? null
  );
}

export function getTaskCardHotkeyDisplayKeys(binding: string) {
  return binding ? binding.split('+') : [];
}

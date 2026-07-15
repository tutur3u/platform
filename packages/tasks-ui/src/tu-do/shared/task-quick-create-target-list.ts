export const DEFAULT_TASK_QUICK_CREATE_TARGET_LIST = 'default_list';

export const TASK_QUICK_CREATE_TARGET_LIST_VALUES = [
  DEFAULT_TASK_QUICK_CREATE_TARGET_LIST,
  'hovered_list',
] as const;

export type TaskQuickCreateTargetList =
  (typeof TASK_QUICK_CREATE_TARGET_LIST_VALUES)[number];

export function normalizeTaskQuickCreateTargetList(
  value: string | null | undefined,
  fallback: TaskQuickCreateTargetList = DEFAULT_TASK_QUICK_CREATE_TARGET_LIST
): TaskQuickCreateTargetList {
  return TASK_QUICK_CREATE_TARGET_LIST_VALUES.includes(
    value as TaskQuickCreateTargetList
  )
    ? (value as TaskQuickCreateTargetList)
    : fallback;
}

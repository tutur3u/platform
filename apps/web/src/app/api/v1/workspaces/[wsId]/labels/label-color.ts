export const TASK_LABEL_COLOR_PRESETS = [
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#06B6D4',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#6B7280',
  '#000000',
] as const;

const taskLabelColorSet = new Set<string>(TASK_LABEL_COLOR_PRESETS);

export function normalizeTaskLabelColor(color: string): string {
  return color.trim().toUpperCase();
}

export function isTaskLabelColorPreset(color: string): boolean {
  return taskLabelColorSet.has(normalizeTaskLabelColor(color));
}

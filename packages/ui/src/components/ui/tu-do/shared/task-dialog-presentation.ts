export const TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID =
  'TASK_DIALOG_DEFAULT_PRESENTATION';

export type TaskDialogPresentation = 'compact' | 'fullscreen';

export function normalizeTaskDialogPresentation(
  value: unknown,
  fallback: TaskDialogPresentation = 'compact'
): TaskDialogPresentation {
  return value === 'fullscreen' || value === 'compact' ? value : fallback;
}

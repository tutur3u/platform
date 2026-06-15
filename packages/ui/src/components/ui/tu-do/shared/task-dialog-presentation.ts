export const TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID =
  'TASK_DIALOG_DEFAULT_PRESENTATION';

export type TaskDialogPresentation = 'compact' | 'fullscreen';
export type TaskDialogMode = 'edit' | 'create';

export function normalizeTaskDialogPresentation(
  value: unknown,
  fallback: TaskDialogPresentation = 'compact'
): TaskDialogPresentation {
  return value === 'fullscreen' || value === 'compact' ? value : fallback;
}

export function resolveTaskDialogOpeningPresentation({
  defaultPresentation,
  draftId,
  mode = 'edit',
  selectedListStatus,
}: {
  defaultPresentation?: unknown;
  draftId?: string;
  mode?: TaskDialogMode;
  selectedListStatus?: string | null;
}): TaskDialogPresentation {
  if (draftId) return 'fullscreen';
  if (mode === 'create') return 'compact';
  if (selectedListStatus === 'documents') return 'fullscreen';

  return normalizeTaskDialogPresentation(defaultPresentation);
}

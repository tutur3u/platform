export const TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID =
  'TASK_DIALOG_DEFAULT_PRESENTATION';

export type TaskDialogPresentation = 'compact' | 'focused' | 'fullscreen';
export type TaskDialogMode = 'edit' | 'create';

export const TASK_DIALOG_FOCUSED_CONTENT_CLASS_NAME =
  'h-[min(92dvh,60rem)] w-[min(calc(100vw-1.5rem),92rem)] max-w-[92rem] gap-0 overflow-hidden rounded-xl border p-0 shadow-2xl sm:max-w-5xl';

/**
 * The dialog's content column, which owns its own scrolling.
 *
 * `min-h-0` is load-bearing. The focused presentation renders inside the shared
 * `DialogContent`, which is a fixed-height `display: grid` box with
 * `overflow-hidden`. A grid item defaults to `min-height: auto`, so this column
 * refused to shrink below its content: on a long description the row grew to the
 * full content height (12,000px+ in the report that surfaced this), the inner
 * `overflow-y-auto` container was sized to its content instead of the dialog, and
 * the overflow was silently clipped by the dialog — nothing scrolled at all.
 * Fullscreen escaped this only because that variant lays out with flex.
 */
export const TASK_DIALOG_CONTENT_COLUMN_CLASS_NAME =
  'flex min-h-0 min-w-0 flex-1 flex-col bg-background transition-all duration-300';

export function normalizeTaskDialogPresentation(
  value: unknown,
  fallback: TaskDialogPresentation = 'focused'
): TaskDialogPresentation {
  return value === 'fullscreen' || value === 'focused' || value === 'compact'
    ? value
    : fallback;
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

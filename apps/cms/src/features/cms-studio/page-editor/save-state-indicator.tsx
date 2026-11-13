'use client';

import { AlertTriangle, Check, Loader2, RotateCcw } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { PageEditorLabels } from './page-editor-labels';
import type { PageEditorSaveState } from './page-editor-model';
import { ieeai } from './page-editor-theme';

export type SaveStateIndicatorProps = {
  state: PageEditorSaveState;
  labels: PageEditorLabels;
  /** Shown on a failed save only when the caller can retry it. */
  onRetry?: () => void;
};

/** Save status as a live region, with an in-place retry after a failure. */
export function SaveStateIndicator({
  state,
  labels,
  onRetry,
}: SaveStateIndicatorProps) {
  if (state.kind === 'error') {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-full bg-red-50 py-1 pr-1 pl-3 text-red-800 text-sm"
      >
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 truncate" title={state.message}>
          {labels.saveFailed}
        </span>
        {onRetry ? (
          <button
            type="button"
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-full bg-white px-3 font-semibold text-red-800',
              ieeai.focus
            )}
            onClick={onRetry}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {labels.retrySave}
          </button>
        ) : null}
      </div>
    );
  }

  const text =
    state.kind === 'saving'
      ? labels.saveSaving
      : state.kind === 'unsaved'
        ? labels.saveUnsaved
        : labels.saveSaved;
  return (
    <output
      aria-live="polite"
      className="inline-flex items-center gap-1.5 text-[var(--ieeai-muted)] text-sm"
    >
      {state.kind === 'saving' ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : state.kind === 'saved' ? (
        <Check className="size-4 text-emerald-600" aria-hidden />
      ) : (
        <span
          aria-hidden
          className="size-2 rounded-full bg-[var(--ieeai-yellow)]"
        />
      )}
      {text}
    </output>
  );
}

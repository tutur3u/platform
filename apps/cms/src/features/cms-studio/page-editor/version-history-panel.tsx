'use client';

import { RotateCcw } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { PageEditorLabels } from './page-editor-labels';
import type { PageEditorHistoryItem } from './page-editor-model';
import { ieeai } from './page-editor-theme';

export type VersionHistoryPanelProps = {
  items: readonly PageEditorHistoryItem[];
  labels: PageEditorLabels;
  formatDate: (iso: string) => string;
  /**
   * Rendered only when the data layer can restore a version. Publish events
   * alone carry no restorable snapshot, so callers omit this until a
   * version list + restore interface exists.
   */
  onRestore?: (itemId: string) => void;
};

const KIND_TONE: Record<PageEditorHistoryItem['kind'], string> = {
  publish: 'bg-[var(--ieeai-yellow)] text-[var(--ieeai-navy)]',
  preview: 'bg-[var(--ieeai-surface-2)] text-[var(--ieeai-muted)]',
  unpublish:
    'bg-white text-[var(--ieeai-muted)] ring-1 ring-[var(--ieeai-border)]',
};

export function VersionHistoryPanel({
  items,
  labels,
  formatDate,
  onRestore,
}: VersionHistoryPanelProps) {
  return (
    <section aria-label={labels.historyTitle} className="flex flex-col gap-3">
      <h2 className={ieeai.eyebrow}>{labels.historyTitle}</h2>
      {items.length === 0 ? (
        <p className="text-[var(--ieeai-muted)] text-sm">
          {labels.historyEmpty}
        </p>
      ) : (
        <ol className="flex flex-col">
          {items.map((item) => {
            const when = formatDate(item.at);
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 border-[var(--ieeai-border)] border-b py-2.5 last:border-b-0"
              >
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2.5 py-0.5 font-semibold text-xs',
                    KIND_TONE[item.kind]
                  )}
                >
                  {labels.historyKind(item.kind)}
                </span>
                <span className="min-w-0 flex-1">
                  <time
                    dateTime={item.at}
                    className="block text-[var(--ieeai-ink)] text-sm"
                  >
                    {when}
                  </time>
                  {item.by ? (
                    <span className="block truncate text-[var(--ieeai-subtle)] text-xs">
                      {labels.historyBy(item.by)}
                    </span>
                  ) : null}
                </span>
                {onRestore ? (
                  <button
                    type="button"
                    className={cn(ieeai.iconButton, ieeai.focus)}
                    aria-label={labels.restoreVersion(when)}
                    title={labels.restoreVersion(when)}
                    onClick={() => onRestore(item.id)}
                  >
                    <RotateCcw className="size-4" aria-hidden />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

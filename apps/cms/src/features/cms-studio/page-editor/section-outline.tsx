'use client';

import { ArrowDown, ArrowUp, CopyPlus, Plus, Trash2 } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { KeyboardEvent } from 'react';
import type { PageEditorLabels } from './page-editor-labels';
import type {
  PageEditorMoveDirection,
  PageEditorSection,
} from './page-editor-model';
import { ieeai } from './page-editor-theme';

export type SectionOutlineProps = {
  sections: readonly PageEditorSection[];
  selectedId: string | null;
  labels: PageEditorLabels;
  onSelect: (sectionId: string) => void;
  /** Rendered only when the data layer can reorder sections. */
  onMove?: (sectionId: string, direction: PageEditorMoveDirection) => void;
  /** Rendered only when the data layer can duplicate a section. */
  onDuplicate?: (sectionId: string) => void;
  /** Rendered only when the data layer can delete a section. */
  onDelete?: (sectionId: string) => void;
  /** Rendered only when the data layer can add a section. */
  onAdd?: () => void;
  /** Sections with a write in flight; their controls are disabled. */
  pendingIds?: ReadonlySet<string>;
};

export function SectionOutline({
  sections,
  selectedId,
  labels,
  onSelect,
  onMove,
  onDuplicate,
  onDelete,
  onAdd,
  pendingIds,
}: SectionOutlineProps) {
  const titleOf = (section: PageEditorSection, index: number) =>
    section.title?.trim() || labels.untitledSection(index + 1);

  const onItemKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    sectionId: string
  ) => {
    if (!onMove || !event.altKey) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      onMove(sectionId, event.key === 'ArrowUp' ? 'up' : 'down');
    }
  };

  return (
    <nav aria-label={labels.outlineTitle} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className={cn(ieeai.eyebrow)}>{labels.outlineTitle}</h2>
        {onAdd ? (
          <button
            type="button"
            className={cn(ieeai.iconButton, ieeai.focus)}
            aria-label={labels.addSection}
            title={labels.addSection}
            onClick={onAdd}
          >
            <Plus className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {sections.length === 0 ? (
        <p className="text-[var(--ieeai-muted)] text-sm">
          {labels.emptyOutline}
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {sections.map((section, index) => {
            const title = titleOf(section, index);
            const selected = section.id === selectedId;
            const pending = pendingIds?.has(section.id) ?? false;
            return (
              <li
                key={section.id}
                className={cn(
                  'group flex items-center gap-1 rounded-[12px] border bg-white pr-1 transition-colors',
                  selected
                    ? 'border-[var(--ieeai-navy)] shadow-[inset_3px_0_0_var(--ieeai-yellow)]'
                    : 'border-[var(--ieeai-border)] hover:border-[var(--ieeai-subtle)]'
                )}
              >
                <button
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  aria-label={labels.selectSection(title)}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-3 rounded-[11px] px-3 py-2.5 text-left',
                    ieeai.focus
                  )}
                  onClick={() => onSelect(section.id)}
                  onKeyDown={(event) => onItemKeyDown(event, section.id)}
                >
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--ieeai-surface-2)] font-[family-name:var(--ieeai-display)] font-bold text-[var(--ieeai-navy)] text-xs"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-[var(--ieeai-ink)] text-sm">
                      {title}
                    </span>
                    <span className="block truncate text-[var(--ieeai-subtle)] text-xs">
                      {labels.sectionType(section.blockType)}
                    </span>
                  </span>
                </button>

                {onMove ? (
                  <>
                    <button
                      type="button"
                      className={cn(ieeai.iconButton, ieeai.focus)}
                      aria-label={labels.moveSectionUp(title)}
                      title={labels.moveSectionUp(title)}
                      disabled={pending || index === 0}
                      onClick={() => onMove(section.id, 'up')}
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={cn(ieeai.iconButton, ieeai.focus)}
                      aria-label={labels.moveSectionDown(title)}
                      title={labels.moveSectionDown(title)}
                      disabled={pending || index === sections.length - 1}
                      onClick={() => onMove(section.id, 'down')}
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </button>
                  </>
                ) : null}
                {onDuplicate ? (
                  <button
                    type="button"
                    className={cn(ieeai.iconButton, ieeai.focus)}
                    aria-label={labels.duplicateSection(title)}
                    title={labels.duplicateSection(title)}
                    disabled={pending}
                    onClick={() => onDuplicate(section.id)}
                  >
                    <CopyPlus className="size-4" aria-hidden />
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    className={cn(
                      ieeai.iconButton,
                      ieeai.focus,
                      'hover:bg-red-50 hover:text-red-700'
                    )}
                    aria-label={labels.deleteSection(title)}
                    title={labels.deleteSection(title)}
                    disabled={pending}
                    onClick={() => onDelete(section.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );
}

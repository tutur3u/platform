'use client';

import { ChevronRight } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useId } from 'react';
import type { WorkspacePickerPartition } from './partition';
import { type PickerRowContext, PickerSection } from './picker-section';

export function PickerList({
  listId,
  label,
  partition,
  context,
  query,
  totalCount,
  hiddenCount,
  hiddenOpen,
  onHiddenOpenChange,
}: {
  listId: string;
  label: string;
  partition: WorkspacePickerPartition;
  context: PickerRowContext;
  query: string;
  totalCount: number;
  hiddenCount: number;
  hiddenOpen: boolean;
  onHiddenOpenChange: (open: boolean) => void;
}) {
  const { t } = context;
  const hiddenPanelId = useId();
  const visibleCount =
    partition.personal.length +
    partition.internal.length +
    partition.pinned.length +
    partition.recent.length +
    partition.rest.length;
  return (
    <>
      <div aria-label={label} className="px-1.5 pt-1" id={listId} role="group">
        <PickerSection
          context={context}
          heading={t('picker_section_personal')}
          id="personal"
          rows={partition.personal}
        />
        <PickerSection
          context={context}
          heading={t('picker_section_internal')}
          id="internal"
          rows={partition.internal}
        />
        <PickerSection
          context={context}
          heading={t('picker_pinned')}
          id="pinned"
          rows={partition.pinned}
        />
        <PickerSection
          context={context}
          heading={t('picker_recent')}
          id="recent"
          rows={partition.recent}
        />
        <PickerSection
          context={context}
          heading={t('picker_section_workspaces')}
          id="all"
          rows={partition.rest}
        />
        {visibleCount === 0 ? (
          <p
            className="px-3 py-8 text-center text-muted-foreground text-sm"
            role="status"
          >
            {!query && totalCount
              ? t('all_workspaces_hidden')
              : t('no_workspace_found')}
          </p>
        ) : null}
      </div>
      <div
        className="mx-1.5 mt-1.5 border-t pt-1.5 pb-1"
        data-testid="workspace-picker-section-hidden"
      >
        <button
          aria-controls={hiddenPanelId}
          aria-expanded={hiddenOpen}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-start text-muted-foreground text-sm hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="workspace-picker-hidden-toggle"
          onClick={() => onHiddenOpenChange(!hiddenOpen)}
          type="button"
        >
          <ChevronRight
            className={cn(
              'size-4 motion-safe:transition-transform',
              hiddenOpen && 'rotate-90'
            )}
          />
          <span className="flex-1">
            {t('hidden_workspaces')} ({hiddenCount})
          </span>
        </button>
        {hiddenOpen ? (
          <div id={hiddenPanelId}>
            {partition.hidden.length ? (
              <PickerSection
                context={context}
                hidden
                id="hidden-rows"
                rows={partition.hidden}
              />
            ) : (
              <p
                className="px-3 py-4 text-muted-foreground text-sm"
                role="status"
              >
                {t('hidden_workspaces_empty')}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}

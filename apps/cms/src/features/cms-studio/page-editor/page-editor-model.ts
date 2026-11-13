import type {
  ExternalProjectBlock,
  ExternalProjectPublishEvent,
} from '@tuturuuu/types';

/**
 * Presentation model for the full-page editor. Pure derivations from data
 * the studio already loads; no fetching, mutation or persistence here.
 */

export type PageEditorSection = {
  id: string;
  title: string | null;
  blockType: string;
  sortOrder: number;
};

export type PageEditorSaveState =
  | { kind: 'saved' }
  | { kind: 'saving' }
  | { kind: 'unsaved' }
  | { kind: 'error'; message: string };

export type PageEditorHistoryKind = 'publish' | 'preview' | 'unpublish';

export type PageEditorHistoryItem = {
  id: string;
  kind: PageEditorHistoryKind;
  at: string;
  by: string | null;
};

export type PageEditorMoveDirection = 'up' | 'down';

/** The entry's sections in page order: sort_order, then creation time. */
export function orderSectionsForEntry(
  blocks: readonly ExternalProjectBlock[],
  entryId: string
): PageEditorSection[] {
  return blocks
    .filter((block) => block.entry_id === entryId)
    .slice()
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id)
    )
    .map((block) => ({
      id: block.id,
      title: block.title,
      blockType: block.block_type,
      sortOrder: block.sort_order,
    }));
}

/**
 * The two sort_order writes that move a section one place up or down, or
 * null at either end. Swapping keeps every other section's order unchanged.
 * Applying them is the caller's (data layer's) job.
 */
export function sectionMoveUpdates(
  sections: readonly PageEditorSection[],
  sectionId: string,
  direction: PageEditorMoveDirection
): { id: string; sortOrder: number }[] | null {
  const index = sections.findIndex((section) => section.id === sectionId);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  const current = sections[index];
  const target = sections[targetIndex];
  if (index === -1 || !current || !target) return null;
  // Equal sort_order values would make a swap a no-op; fall back to indices.
  const currentOrder =
    current.sortOrder === target.sortOrder ? index : current.sortOrder;
  const targetOrder =
    current.sortOrder === target.sortOrder ? targetIndex : target.sortOrder;
  return [
    { id: current.id, sortOrder: targetOrder },
    { id: target.id, sortOrder: currentOrder },
  ];
}

/** This entry's publish, preview and unpublish events, newest first. */
export function historyItemsForEntry(
  events: readonly ExternalProjectPublishEvent[],
  entryId: string
): PageEditorHistoryItem[] {
  return events
    .filter((event) => event.entry_id === entryId)
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((event) => ({
      id: event.id,
      kind: event.event_kind,
      at: event.created_at,
      by: event.triggered_by,
    }));
}

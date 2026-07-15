export const DEFAULT_KANBAN_COLUMN_WIDTH = '21.875rem';

const KANBAN_COLUMN_GAP_REM = 0.75;
const COLLAPSED_KANBAN_COLUMN_WIDTH_REM = 3.5;

interface KanbanColumnWidthOptions {
  columnCount: number;
  collapsedColumnCount: number;
  snapEdgePadding: string;
  fillAvailableWidth: boolean;
}

export function getKanbanColumnWidth({
  columnCount,
  collapsedColumnCount,
  snapEdgePadding,
  fillAvailableWidth,
}: KanbanColumnWidthOptions) {
  const expandedColumnCount = Math.max(1, columnCount - collapsedColumnCount);

  if (columnCount === 0 || expandedColumnCount <= 1 || !fillAvailableWidth) {
    return DEFAULT_KANBAN_COLUMN_WIDTH;
  }

  const collapsedColumnsWidthRem =
    collapsedColumnCount * COLLAPSED_KANBAN_COLUMN_WIDTH_REM;
  const gapWidthRem = Math.max(0, columnCount - 1) * KANBAN_COLUMN_GAP_REM;

  return `max(${DEFAULT_KANBAN_COLUMN_WIDTH}, calc((100% - (${snapEdgePadding} * 2) - ${gapWidthRem}rem - ${collapsedColumnsWidthRem}rem) / ${expandedColumnCount}))`;
}

import { findParentNode } from '@tiptap/core';
import { Node, ResolvedPos } from '@tiptap/pm/model';
import { Selection, Transaction } from '@tiptap/pm/state';
import { CellSelection, Rect, TableMap } from '@tiptap/pm/tables';

export const isRectSelected = (rect: Rect) => (selection: CellSelection) => {
  const map = TableMap.get(selection.$anchorCell.node(-1));
  const start = selection.$anchorCell.start(-1);
  const cells = map.cellsInRect(rect).filter((cell) => cell !== undefined);
  const selectedCells = map
    .cellsInRect(
      map.rectBetween(
        selection.$anchorCell.pos - start,
        selection.$headCell.pos - start
      )
    )
    .filter((cell) => cell !== undefined);

  for (let i = 0, count = cells.length; i < count; i += 1) {
    if (selectedCells.indexOf(cells[i]!) === -1) {
      return false;
    }
  }

  return true;
};

export const findTable = (selection: Selection) =>
  findParentNode(
    (node) => node.type.spec.tableRole && node.type.spec.tableRole === 'table'
  )(selection);

export const isCellSelection = (
  selection: Selection
): selection is CellSelection => selection instanceof CellSelection;

export const isColumnSelected =
  (columnIndex: number) => (selection: Selection) => {
    if (isCellSelection(selection)) {
      const map = TableMap.get(selection.$anchorCell.node(-1));

      return isRectSelected({
        left: columnIndex,
        right: columnIndex + 1,
        top: 0,
        bottom: map.height,
      })(selection);
    }

    return false;
  };

export const isRowSelected = (rowIndex: number) => (selection: Selection) => {
  if (isCellSelection(selection)) {
    const map = TableMap.get(selection.$anchorCell.node(-1));

    return isRectSelected({
      left: 0,
      right: map.width,
      top: rowIndex,
      bottom: rowIndex + 1,
    })(selection);
  }

  return false;
};

export const isTableSelected = (selection: Selection) => {
  if (isCellSelection(selection)) {
    const map = TableMap.get(selection.$anchorCell.node(-1));

    return isRectSelected({
      left: 0,
      right: map.width,
      top: 0,
      bottom: map.height,
    })(selection);
  }

  return false;
};

export const getCellsInColumn =
  (columnIndex: number | number[]) => (selection: Selection) => {
    const table = findTable(selection);
    if (table) {
      const map = TableMap.get(table.node);
      const indexes = Array.isArray(columnIndex) ? columnIndex : [columnIndex];

      return indexes.reduce(
        (acc, index) => {
          if (index >= 0 && index <= map.width - 1) {
            const cells = map.cellsInRect({
              left: index,
              right: index + 1,
              top: 0,
              bottom: map.height,
            });

            return acc.concat(
              cells.map((nodePos) => {
                const node = table.node.nodeAt(nodePos);
                const pos = nodePos + table.start;

                return { pos, start: pos + 1, node };
              })
            );
          }

          return acc;
        },
        [] as { pos: number; start: number; node: Node | null | undefined }[]
      );
    }
    return null;
  };

export const getCellsInRow =
  (rowIndex: number | number[]) => (selection: Selection) => {
    const table = findTable(selection);

    if (table) {
      const map = TableMap.get(table.node);
      const indexes = Array.isArray(rowIndex) ? rowIndex : [rowIndex];

      return indexes.reduce(
        (acc, index) => {
          if (index >= 0 && index <= map.height - 1) {
            const cells = map.cellsInRect({
              left: 0,
              right: map.width,
              top: index,
              bottom: index + 1,
            });

            return acc.concat(
              cells.map((nodePos) => {
                const node = table.node.nodeAt(nodePos);
                const pos = nodePos + table.start;
                return { pos, start: pos + 1, node };
              })
            );
          }

          return acc;
        },
        [] as { pos: number; start: number; node: Node | null | undefined }[]
      );
    }

    return null;
  };

export const getCellsInTable = (selection: Selection) => {
  const table = findTable(selection);

  if (table) {
    const map = TableMap.get(table.node);
    const cells = map.cellsInRect({
      left: 0,
      right: map.width,
      top: 0,
      bottom: map.height,
    });

    return cells.map((nodePos) => {
      const node = table.node.nodeAt(nodePos);
      const pos = nodePos + table.start;

      return { pos, start: pos + 1, node };
    });
  }

  return null;
};

export const findParentNodeClosestToPos = (
  $pos: ResolvedPos,
  predicate: (node: Node) => boolean
) => {
  for (let i = $pos.depth; i > 0; i -= 1) {
    const node = $pos.node(i);

    if (predicate(node)) {
      return {
        pos: i > 0 ? $pos.before(i) : 0,
        start: $pos.start(i),
        depth: i,
        node,
      };
    }
  }

  return null;
};

export const findCellClosestToPos = ($pos: ResolvedPos) => {
  const predicate = (node: Node) =>
    node.type.spec.tableRole && /cell/i.test(node.type.spec.tableRole);

  return findParentNodeClosestToPos($pos, predicate);
};

export const select =
  (type: 'row' | 'column') => (index: number) => (tr: Transaction) => {
    const table = findTable(tr.selection)!;
    const isRowSelection = type === 'row';

    if (table) {
      const map = TableMap.get(table.node);

      // Ensure map is valid
      if (map) {
        // Validate the index and ensure it falls within the valid range
        if (
          index !== undefined &&
          index >= 0 &&
          index < (isRowSelection ? map.height : map.width)
        ) {
          const left = isRowSelection ? 0 : index;
          const top = isRowSelection ? index : 0;
          const right = isRowSelection ? map.width : index + 1;
          const bottom = isRowSelection ? index + 1 : map.height;

          // Cells in the first row
          const cellsInFirstRow =
            map.cellsInRect({
              left,
              top,
              right: isRowSelection ? right : left + 1,
              bottom: isRowSelection ? top + 1 : bottom,
            }) || []; // Fallback to empty array if undefined

          // Cells in the last row
          const cellsInLastRow =
            bottom - top === 1
              ? cellsInFirstRow
              : map.cellsInRect({
                  left: isRowSelection ? left : right - 1,
                  top: isRowSelection ? bottom - 1 : top,
                  right,
                  bottom,
                }) || []; // Fallback to empty array if undefined

          // Ensure both arrays have elements before proceeding
          if (cellsInFirstRow.length > 0 && cellsInLastRow.length > 0) {
            const head =
              cellsInFirstRow.length > 0 && cellsInFirstRow[0]
                ? table.start + cellsInFirstRow[0]
                : 0;
            let anchor = 0;
            if (cellsInLastRow.length > 0 && cellsInLastRow) {
              anchor =
                cellsInLastRow.length > 0 &&
                cellsInLastRow[cellsInLastRow.length - 1]
                  ? table.start + cellsInLastRow[cellsInLastRow.length - 1]!
                  : 0;
            }

            const $head = tr.doc.resolve(head);
            const $anchor = tr.doc.resolve(anchor);

            return tr.setSelection(new CellSelection($anchor, $head));
          }
        }
      }
    }
    return tr;
  };

export const selectColumn = select('column');

export const selectRow = select('row');
export const selectTable = (tr: Transaction) => {
  const table = findTable(tr.selection);

  if (table) {
    const map = TableMap.get(table.node);

    // Ensure map is valid (defined and non-empty)
    if (map && map.width > 0 && map.height > 0) {
      // Use cellsInRect to get the first and last cells in the table

      // First row (top-left corner)
      const cellsInFirstRow = map.cellsInRect({
        left: 0,
        top: 0,
        right: map.width,
        bottom: 1,
      });
      // Last row (bottom-right corner)
      const cellsInLastRow = map.cellsInRect({
        left: 0,
        top: map.height - 1,
        right: map.width,
        bottom: map.height,
      });

      // Ensure both rows have valid cells
      if (cellsInFirstRow.length > 0 && cellsInLastRow.length > 0) {
        const head = table.start + cellsInFirstRow[0]!; // First cell (top-left)
        const anchor = table.start + cellsInLastRow[cellsInLastRow.length - 1]!; // Last cell (bottom-right)

        const $head = tr.doc.resolve(head);
        const $anchor = tr.doc.resolve(anchor);

        // Set the selection
        return tr.setSelection(new CellSelection($anchor, $head));
      } else {
        console.error('Table rows are not valid or empty');
      }
    } else {
      console.error('Table map is either undefined, empty, or invalid');
    }
  }

  return tr;
};

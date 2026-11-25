import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/documents/document_table.dart';

/// Builds the content of the cell at [row], [col] of [DocumentTable.rows].
typedef DocumentTableCellBuilder =
    Widget Function(BuildContext context, int row, int col);

/// A table drawn on its grid: a merged cell (`colspan`, `rowspan`) reads
/// as one region, with no lines inside it, and shows its content in its
/// first position. Header cells are shaded.
class DocumentTableGrid extends StatelessWidget {
  const DocumentTableGrid({
    required this.table,
    required this.cellBuilder,
    this.columnWidth = const IntrinsicColumnWidth(),
    super.key,
  });

  final DocumentTable table;
  final DocumentTableCellBuilder cellBuilder;
  final TableColumnWidth columnWidth;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final grid = table.grid();
    if (grid.isEmpty || grid.first.isEmpty) return const SizedBox.shrink();
    final line = BorderSide(color: c.border);
    return Table(
      defaultColumnWidth: columnWidth,
      defaultVerticalAlignment: TableCellVerticalAlignment.intrinsicHeight,
      border: TableBorder(top: line, left: line),
      children: [
        for (final slots in grid)
          TableRow(
            children: [
              for (final slot in slots)
                DecoratedBox(
                  decoration: BoxDecoration(
                    color:
                        slot != null &&
                            table.rows[slot.row][slot.col]['type'] ==
                                'tableHeader'
                        ? c.muted
                        : null,
                    border: Border(
                      right: slot == null || slot.lastCol
                          ? line
                          : BorderSide.none,
                      bottom: slot == null || slot.lastRow
                          ? line
                          : BorderSide.none,
                    ),
                  ),
                  child: slot != null && slot.origin
                      ? cellBuilder(context, slot.row, slot.col)
                      : const SizedBox(height: 32),
                ),
            ],
          ),
      ],
    );
  }
}

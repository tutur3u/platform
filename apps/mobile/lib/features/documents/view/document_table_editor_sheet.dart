import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/documents/document_table.dart';
import 'package:mobile/l10n/l10n.dart';

/// What the table editor returns: the edited node, or a deletion.
typedef DocumentTableEdit = ({Map<String, dynamic>? node, bool delete});

/// Edits a table's cells and shape. Cells keep their stored content until
/// their text changes; tables with merged cells take text edits only.
class DocumentTableEditorSheet extends StatefulWidget {
  const DocumentTableEditorSheet({required this.node, super.key});

  final Map<String, dynamic> node;

  @override
  State<DocumentTableEditorSheet> createState() =>
      _DocumentTableEditorSheetState();
}

class _DocumentTableEditorSheetState extends State<DocumentTableEditorSheet> {
  late final DocumentTable _table = DocumentTable.fromNode(widget.node);
  late final bool _merged = _table.hasMergedCells;
  final List<List<TextEditingController>> _cells = [];

  @override
  void initState() {
    super.initState();
    for (var r = 0; r < _table.rowCount; r++) {
      _cells.add([
        for (var c = 0; c < _table.rows[r].length; c++)
          TextEditingController(text: _table.textAt(r, c)),
      ]);
    }
  }

  @override
  void dispose() {
    for (final row in _cells) {
      for (final cell in row) {
        cell.dispose();
      }
    }
    super.dispose();
  }

  /// Writes the fields into the table before it changes shape.
  void _commitText() {
    for (var r = 0; r < _cells.length; r++) {
      for (var c = 0; c < _cells[r].length; c++) {
        _table.setText(r, c, _cells[r][c].text);
      }
    }
  }

  void _reshape(void Function() change) {
    _commitText();
    change();
    setState(() {
      for (final row in _cells) {
        for (final cell in row) {
          cell.dispose();
        }
      }
      _cells
        ..clear()
        ..addAll([
          for (var r = 0; r < _table.rowCount; r++)
            [
              for (var c = 0; c < _table.rows[r].length; c++)
                TextEditingController(text: _table.textAt(r, c)),
            ],
        ]);
    });
  }

  void _done() {
    _commitText();
    Navigator.of(
      context,
    ).pop<DocumentTableEdit>((node: _table.toNode(), delete: false));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final rows = _table.rowCount;
    final cols = _table.columnCount;
    final header = _table.hasHeaderRow;
    final shape = !_merged;
    return AppSheetScaffold(
      title: l10n.documentsTableEdit,
      icon: LucideIcons.table,
      actions: [
        AppButton.destructive(
          key: const ValueKey('document-table-delete'),
          leading: const Icon(LucideIcons.trash2),
          onPressed: () => Navigator.of(
            context,
          ).pop<DocumentTableEdit>((node: null, delete: true)),
          child: Text(l10n.documentsTableDelete),
        ),
        AppButton.primary(
          key: const ValueKey('document-table-done'),
          onPressed: _done,
          child: Text(l10n.commonDone),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              _ShapeButton(
                icon: LucideIcons.betweenHorizontalEnd,
                label: l10n.documentsTableAddRow,
                onPressed: shape ? () => _reshape(_table.addRow) : null,
              ),
              _ShapeButton(
                icon: LucideIcons.betweenVerticalEnd,
                label: l10n.documentsTableAddColumn,
                onPressed: shape ? () => _reshape(_table.addColumn) : null,
              ),
              _ShapeButton(
                icon: LucideIcons.panelBottomClose,
                label: l10n.documentsTableRemoveRow,
                onPressed: shape && rows > 1
                    ? () => _reshape(() => _table.removeRow(rows - 1))
                    : null,
              ),
              _ShapeButton(
                icon: LucideIcons.panelRightClose,
                label: l10n.documentsTableRemoveColumn,
                onPressed: shape && cols > 1
                    ? () => _reshape(() => _table.removeColumn(cols - 1))
                    : null,
              ),
            ],
          ),
          AppToggleRow(
            title: Text(l10n.documentsTableHeaderRow),
            value: header,
            onChanged: (_) => _reshape(_table.toggleHeaderRow),
          ),
          if (_merged)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: Text(
                l10n.documentsTableMergedCells,
                style: tokens.typography.small.copyWith(
                  color: c.mutedForeground,
                ),
              ),
            ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Table(
              defaultColumnWidth: const FixedColumnWidth(160),
              border: TableBorder.all(
                color: c.border,
                borderRadius: BorderRadius.circular(AppRadius.xs),
              ),
              children: [
                for (var r = 0; r < _cells.length; r++)
                  TableRow(
                    decoration: r == 0 && header
                        ? BoxDecoration(color: c.muted)
                        : null,
                    children: [
                      for (var col = 0; col < cols; col++)
                        if (col < _cells[r].length)
                          Padding(
                            padding: const EdgeInsets.all(AppSpacing.xxs),
                            child: AppTextField(
                              key: ValueKey('document-table-field-$r-$col'),
                              controller: _cells[r][col],
                              placeholder: l10n.inputPlaceholderTableCell,
                              borderless: true,
                              minLines: 1,
                              maxLines: 4,
                              style: r == 0 && header
                                  ? const TextStyle(fontWeight: FontWeight.w600)
                                  : null,
                            ),
                          )
                        else
                          const SizedBox.shrink(),
                    ],
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ShapeButton extends StatelessWidget {
  const _ShapeButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => AppButton.outline(
    density: AppButtonDensity.compact,
    leading: Icon(icon),
    onPressed: onPressed,
    child: Text(label),
  );
}

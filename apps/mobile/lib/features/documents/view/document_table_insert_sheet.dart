import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// The size of a table to insert.
typedef DocumentTableSize = ({int rows, int cols, bool headerRow});

/// Picks a new table's size on a grid, with a header row as the web's
/// table command adds by default (3 by 3). Pops a [DocumentTableSize].
class DocumentTableInsertSheet extends StatefulWidget {
  const DocumentTableInsertSheet({super.key});

  static const int maxRows = 8;
  static const int maxCols = 6;

  @override
  State<DocumentTableInsertSheet> createState() =>
      _DocumentTableInsertSheetState();
}

class _DocumentTableInsertSheetState extends State<DocumentTableInsertSheet> {
  int _rows = 3;
  int _cols = 3;
  bool _header = true;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return AppSheetScaffold(
      title: l10n.documentsTableInsertTitle,
      icon: LucideIcons.table,
      actions: [
        AppButton.primary(
          key: const ValueKey('document-table-insert'),
          onPressed: () => Navigator.of(context).pop<DocumentTableSize>((
            rows: _rows,
            cols: _cols,
            headerRow: _header,
          )),
          child: Text(l10n.documentsTableInsert),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '${l10n.documentsTableRows} $_rows  ·  '
            '${l10n.documentsTableColumns} $_cols',
            textAlign: TextAlign.center,
            style: tokens.typography.small.copyWith(
              color: c.mutedForeground,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (var r = 1; r <= DocumentTableInsertSheet.maxRows; r++)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (
                        var col = 1;
                        col <= DocumentTableInsertSheet.maxCols;
                        col++
                      )
                        _GridCell(
                          key: ValueKey('document-table-cell-$r-$col'),
                          on: r <= _rows && col <= _cols,
                          header: _header && r == 1,
                          label: '$r × $col',
                          onTap: () => setState(() {
                            _rows = r;
                            _cols = col;
                          }),
                        ),
                    ],
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          AppToggleRow(
            title: Text(l10n.documentsTableHeaderRow),
            value: _header,
            onChanged: (value) => setState(() => _header = value),
          ),
        ],
      ),
    );
  }
}

class _GridCell extends StatelessWidget {
  const _GridCell({
    required this.on,
    required this.header,
    required this.label,
    required this.onTap,
    super.key,
  });

  final bool on;
  final bool header;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final fill = !on
        ? c.muted.withValues(alpha: 0.5)
        : header
        ? c.primary
        : c.primary.withValues(alpha: 0.45);
    return Semantics(
      button: true,
      selected: on,
      label: label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(3),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            width: 34,
            height: 26,
            decoration: BoxDecoration(
              color: fill,
              borderRadius: BorderRadius.circular(AppRadius.xs),
              border: Border.all(color: on ? c.primary : c.border),
            ),
          ),
        ),
      ),
    );
  }
}

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/documents/document_table.dart';
import 'package:mobile/features/documents/view/document_block_insert.dart';
import 'package:mobile/features/documents/view/document_table_editor_sheet.dart';
import 'package:mobile/features/documents/view/document_table_grid.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Quill embed type for a TipTap table, carried as its JSON.
const String documentTableEmbedType = 'table';

/// Called with the offset and node of a table the user asked to edit.
typedef DocumentTableEditCallback =
    void Function(int offset, Map<String, dynamic> node);

/// Renders a table with an edit control; tapping the table opens it in
/// the editor too.
class DocumentTableEmbedBuilder extends EmbedBuilder {
  const DocumentTableEmbedBuilder({this.onEdit});

  final DocumentTableEditCallback? onEdit;

  @override
  String get key => documentTableEmbedType;

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final node = _tableNode(embedContext.node.value.data);
    if (node == null) return const SizedBox.shrink();
    final table = DocumentTableView(table: DocumentTable.fromNode(node));
    final onEdit = this.onEdit;
    if (onEdit == null || embedContext.readOnly) return table;
    void edit() => onEdit(embedContext.node.documentOffset, node);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Flexible(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: edit,
            child: table,
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(left: AppSpacing.xxs),
          child: AppIconButton(
            key: const ValueKey('document-table-edit'),
            icon: const Icon(LucideIcons.squarePen),
            tooltip: context.l10n.documentsTableEdit,
            onPressed: edit,
          ),
        ),
      ],
    );
  }
}

/// A table's cells as text, the header row shaded, scrolling sideways
/// when wider than the page.
class DocumentTableView extends StatelessWidget {
  const DocumentTableView({required this.table, super.key});

  final DocumentTable table;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    if (table.rowCount == 0 || table.columnCount == 0) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DocumentTableGrid(
          table: table,
          cellBuilder: (context, row, col) => Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.xs,
            ),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minWidth: 48, maxWidth: 280),
              child: Text(
                table.textAt(row, col),
                style: tokens.typography.small.copyWith(
                  color: c.foreground,
                  fontWeight: table.rows[row][col]['type'] == 'tableHeader'
                      ? FontWeight.w600
                      : null,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

Map<String, dynamic>? _tableNode(Object? data) {
  if (data is! String || data.isEmpty) return null;
  try {
    final decoded = jsonDecode(data);
    if (decoded is Map<String, dynamic> && decoded['type'] == 'table') {
      return decoded;
    }
  } on FormatException {
    // Not a table.
  }
  return null;
}

/// Opens the editor for the table at [offset] and applies the result.
Future<void> editDocumentTable(
  BuildContext context,
  QuillController editor,
  int offset,
  Map<String, dynamic> node,
) async {
  final edit = await showAppSheet<DocumentTableEdit>(
    context: context,
    size: AppSheetSize.large,
    maxDialogWidth: 920,
    builder: (_) => DocumentTableEditorSheet(node: node),
  );
  if (edit == null || !context.mounted) return;
  // The sheet edited [node]; apply the result only while the document still
  // holds that same table there, not another one moved into its place.
  final embedded = documentEmbedAt(editor, offset, documentTableEmbedType);
  if (embedded is! String || _tableNode(embedded) == null) return;
  if (jsonEncode(_tableNode(embedded)) != jsonEncode(node)) return;
  if (edit.delete) {
    deleteDocumentBlock(editor, offset);
    return;
  }
  final next = edit.node;
  if (next == null) return;
  final value = jsonEncode(next);
  if (value == embedded) return;
  replaceDocumentEmbed(
    editor,
    offset,
    BlockEmbed(documentTableEmbedType, value),
  );
}

import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

String _extractTextFromContent(Object? content) {
  if (content is! List) return '';
  final buffer = StringBuffer();
  for (final node in content) {
    final nodeMap = _stringKeyedMap(node);
    if (nodeMap == null) continue;
    if (nodeMap['type'] == 'text') {
      final text = nodeMap['text'];
      if (text is String) buffer.write(text);
    } else {
      buffer.write(_extractTextFromContent(nodeMap['content']));
    }
  }
  return buffer.toString();
}

List<Object?> _objectList(Object? value) => value is List ? value : const [];

Map<String, dynamic>? _stringKeyedMap(Object? value) {
  if (value is! Map) return null;

  final result = <String, dynamic>{};
  for (final entry in value.entries) {
    final key = entry.key;
    if (key is String) {
      result[key] = entry.value;
    }
  }
  return result;
}

class TaskDescriptionTableEmbedBuilder extends EmbedBuilder {
  const TaskDescriptionTableEmbedBuilder({this.onTableUpdated});

  final Future<void> Function(EmbedContext context, String tableJson)?
  onTableUpdated;

  @override
  String get key => 'table';

  @override
  Widget build(BuildContext context, EmbedContext embedContext) {
    final data = embedContext.node.value.data as String? ?? '';
    if (data.isEmpty) return const SizedBox.shrink();

    try {
      final tableNode = jsonDecode(data);
      if (tableNode is! Map<String, dynamic>) return const SizedBox.shrink();
      return _buildTable(
        context,
        embedContext: embedContext,
        tableNode: tableNode,
      );
    } on Object {
      return const SizedBox.shrink();
    }
  }

  Widget _buildTable(
    BuildContext context, {
    required EmbedContext embedContext,
    required Map<String, dynamic> tableNode,
  }) {
    final rows = _objectList(tableNode['content']);
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;
    final canEdit = !embedContext.readOnly && onTableUpdated != null;

    final tableRows = <TableRow>[];
    var isFirstRow = true;

    for (final rowRaw in rows) {
      final row = _stringKeyedMap(rowRaw);
      if (row == null || row['type'] != 'tableRow') {
        continue;
      }

      final cells = _objectList(row['content']);
      final isHeader = isFirstRow;
      final cellWidgets = <Widget>[];

      for (final cellRaw in cells) {
        final cell = _stringKeyedMap(cellRaw);
        final text = cell != null
            ? _extractTextFromContent(cell['content'])
            : '';
        cellWidgets.add(
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Text(
              text,
              style: isHeader
                  ? theme.typography.small.copyWith(fontWeight: FontWeight.w600)
                  : theme.typography.small,
            ),
          ),
        );
      }

      if (cellWidgets.isNotEmpty) {
        tableRows.add(
          TableRow(
            decoration: isHeader
                ? BoxDecoration(
                    color: theme.colorScheme.secondary.withValues(alpha: 0.35),
                  )
                : null,
            children: cellWidgets,
          ),
        );
      }
      isFirstRow = false;
    }

    if (tableRows.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (canEdit)
            Align(
              alignment: Alignment.centerRight,
              child: shad.GhostButton(
                density: shad.ButtonDensity.compact,
                onPressed: () =>
                    _openTableEditor(context, embedContext, tableNode),
                leading: const Icon(Icons.edit_outlined, size: 14),
                child: Text(l10n.timerGoalsEdit),
              ),
            ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Table(
              border: TableBorder.all(color: theme.colorScheme.border),
              defaultColumnWidth: const IntrinsicColumnWidth(),
              children: tableRows,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openTableEditor(
    BuildContext context,
    EmbedContext embedContext,
    Map<String, dynamic> tableNode,
  ) async {
    final edited = await showAdaptiveSheet<Map<String, dynamic>>(
      context: context,
      maxDialogWidth: 920,
      builder: (sheetContext) =>
          TaskDescriptionTableEditorSheet(initialTableNode: tableNode),
    );
    if (edited == null || onTableUpdated == null || !context.mounted) {
      return;
    }

    await onTableUpdated!(embedContext, jsonEncode(edited));
  }
}

class TaskDescriptionTableEditorSheet extends StatefulWidget {
  const TaskDescriptionTableEditorSheet({
    required this.initialTableNode,
    super.key,
  });

  final Map<String, dynamic> initialTableNode;

  @override
  State<TaskDescriptionTableEditorSheet> createState() =>
      TaskDescriptionTableEditorSheetState();
}

class TaskDescriptionTableEditorSheetState
    extends State<TaskDescriptionTableEditorSheet> {
  late final List<List<TextEditingController>> _controllers;

  int get rowCount => _controllers.length;
  int get columnCount => rowCount > 0 ? _controllers.first.length : 0;

  @override
  void initState() {
    super.initState();
    final matrix = _tableTextMatrixFromNode(widget.initialTableNode);
    _controllers = matrix
        .map(
          (row) =>
              row.map((value) => TextEditingController(text: value)).toList(),
        )
        .toList();
  }

  @override
  void dispose() {
    for (final row in _controllers) {
      for (final controller in row) {
        controller.dispose();
      }
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;
    final rows = rowCount;
    final cols = columnCount;

    return Material(
      color: theme.colorScheme.background,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.timerGoalsEdit, style: theme.typography.h4),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  shad.OutlineButton(
                    density: shad.ButtonDensity.compact,
                    leading: const Icon(Icons.add, size: 14),
                    onPressed: _addRow,
                    child: Text(l10n.taskBoardDetailTaskDescriptionTableAddRow),
                  ),
                  shad.OutlineButton(
                    density: shad.ButtonDensity.compact,
                    leading: const Icon(Icons.remove, size: 14),
                    onPressed: rows > 1 ? _removeRow : null,
                    child: Text(
                      l10n.taskBoardDetailTaskDescriptionTableRemoveRow,
                    ),
                  ),
                  shad.OutlineButton(
                    density: shad.ButtonDensity.compact,
                    leading: const Icon(Icons.add, size: 14),
                    onPressed: _addColumn,
                    child: Text(
                      l10n.taskBoardDetailTaskDescriptionTableAddColumn,
                    ),
                  ),
                  shad.OutlineButton(
                    density: shad.ButtonDensity.compact,
                    leading: const Icon(Icons.remove, size: 14),
                    onPressed: cols > 1 ? _removeColumn : null,
                    child: Text(
                      l10n.taskBoardDetailTaskDescriptionTableRemoveColumn,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              LayoutBuilder(
                builder: (context, constraints) {
                  final screenHeight = MediaQuery.sizeOf(context).height;
                  final keyboardInset = MediaQuery.viewInsetsOf(context).bottom;
                  final boundedMaxHeight = constraints.hasBoundedHeight
                      ? constraints.maxHeight
                      : screenHeight - keyboardInset - 220;
                  final tableMaxHeight = boundedMaxHeight.clamp(
                    160.0,
                    screenHeight * 0.45,
                  );

                  return ConstrainedBox(
                    constraints: BoxConstraints(maxHeight: tableMaxHeight),
                    child: SingleChildScrollView(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Table(
                          border: TableBorder.all(
                            color: theme.colorScheme.border,
                          ),
                          defaultColumnWidth: const FixedColumnWidth(180),
                          children: [
                            for (var rowIndex = 0; rowIndex < rows; rowIndex++)
                              TableRow(
                                decoration: rowIndex == 0
                                    ? BoxDecoration(
                                        color: theme.colorScheme.secondary
                                            .withValues(alpha: 0.35),
                                      )
                                    : null,
                                children: [
                                  for (
                                    var columnIndex = 0;
                                    columnIndex < cols;
                                    columnIndex++
                                  )
                                    Padding(
                                      padding: const EdgeInsets.all(6),
                                      child: shad.TextField(
                                        contextMenuBuilder:
                                            platformTextContextMenuBuilder(),
                                        controller:
                                            _controllers[rowIndex][columnIndex],
                                      ),
                                    ),
                                ],
                              ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  shad.OutlineButton(
                    onPressed: () async {
                      await Navigator.of(context).maybePop();
                    },
                    child: Text(l10n.commonCancel),
                  ),
                  const SizedBox(width: 8),
                  shad.PrimaryButton(
                    onPressed: () async {
                      final editedNode = buildEditedTableNode();
                      await Navigator.of(context).maybePop(editedNode);
                    },
                    child: Text(l10n.taskBoardDetailTaskDescriptionDone),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _addRow() {
    final cols = columnCount == 0 ? 1 : columnCount;
    setState(() {
      _controllers.add(
        List<TextEditingController>.generate(
          cols,
          (_) => TextEditingController(),
        ),
      );
    });
  }

  void _removeRow() {
    if (rowCount <= 1) return;
    setState(() {
      final removed = _controllers.removeLast();
      for (final controller in removed) {
        controller.dispose();
      }
    });
  }

  void _addColumn() {
    setState(() {
      for (final row in _controllers) {
        row.add(TextEditingController());
      }
    });
  }

  void _removeColumn() {
    if (columnCount <= 1) return;
    setState(() {
      for (final row in _controllers) {
        row.removeLast().dispose();
      }
    });
  }

  Map<String, dynamic> buildEditedTableNode() {
    final attrs =
        _stringKeyedMap(widget.initialTableNode['attrs']) ??
        const <String, dynamic>{};
    final originalRows = _objectList(widget.initialTableNode['content']);

    final rows = <Map<String, dynamic>>[];
    for (var rowIndex = 0; rowIndex < _controllers.length; rowIndex++) {
      final rowControllers = _controllers[rowIndex];
      final originalRow = rowIndex < originalRows.length
          ? _stringKeyedMap(originalRows[rowIndex])
          : null;
      final originalCells = _objectList(originalRow?['content']);
      final originalRowAttrs = _stringKeyedMap(originalRow?['attrs']);

      final cells = <Map<String, dynamic>>[];
      for (
        var columnIndex = 0;
        columnIndex < rowControllers.length;
        columnIndex++
      ) {
        final originalCell = columnIndex < originalCells.length
            ? _stringKeyedMap(originalCells[columnIndex])
            : null;
        final text = rowControllers[columnIndex].text;
        cells.add(
          _buildUpdatedCell(
            rowIndex: rowIndex,
            originalCell: originalCell,
            text: text,
          ),
        );
      }

      rows.add(<String, dynamic>{
        'type': 'tableRow',
        if (originalRowAttrs != null && originalRowAttrs.isNotEmpty)
          'attrs': originalRowAttrs,
        'content': cells,
      });
    }

    return <String, dynamic>{
      'type': 'table',
      if (attrs.isNotEmpty) 'attrs': attrs,
      'content': rows,
    };
  }

  Map<String, dynamic> _buildUpdatedCell({
    required int rowIndex,
    required Map<String, dynamic>? originalCell,
    required String text,
  }) {
    final fallbackType = rowIndex == 0 ? 'tableHeader' : 'tableCell';
    final type = originalCell?['type'];
    final resolvedType =
        type is String && (type == 'tableHeader' || type == 'tableCell')
        ? type
        : fallbackType;

    final originalParagraph = _firstParagraphFromCell(originalCell);
    final originalParagraphAttrs = _stringKeyedMap(originalParagraph?['attrs']);
    final paragraph = <String, dynamic>{
      'type': 'paragraph',
      if (originalParagraphAttrs != null && originalParagraphAttrs.isNotEmpty)
        'attrs': originalParagraphAttrs,
      if (text.trim().isNotEmpty)
        'content': [
          <String, dynamic>{'type': 'text', 'text': text},
        ],
    };

    final originalCellAttrs = _stringKeyedMap(originalCell?['attrs']);
    return <String, dynamic>{
      'type': resolvedType,
      if (originalCellAttrs != null && originalCellAttrs.isNotEmpty)
        'attrs': originalCellAttrs,
      'content': [paragraph],
    };
  }

  Map<String, dynamic>? _firstParagraphFromCell(Map<String, dynamic>? cell) {
    final content = _objectList(cell?['content']);
    for (final node in content) {
      final nodeMap = _stringKeyedMap(node);
      if (nodeMap != null && nodeMap['type'] == 'paragraph') {
        return nodeMap;
      }
    }
    return null;
  }

  List<List<String>> _tableTextMatrixFromNode(Map<String, dynamic> tableNode) {
    final rows = _objectList(tableNode['content']);
    final matrix = <List<String>>[];

    var maxColumns = 0;
    for (final rowRaw in rows) {
      final row = _stringKeyedMap(rowRaw);
      if (row == null || row['type'] != 'tableRow') {
        continue;
      }
      final cells = _objectList(row['content']);
      final values = <String>[];
      for (final cellRaw in cells) {
        final cell = _stringKeyedMap(cellRaw);
        if (cell == null) {
          values.add('');
          continue;
        }
        values.add(_extractTextFromContent(cell['content']));
      }
      if (values.isNotEmpty) {
        maxColumns = math.max(maxColumns, values.length);
        matrix.add(values);
      }
    }

    if (maxColumns == 0) {
      maxColumns = 1;
    }
    if (matrix.isEmpty) {
      matrix.add(List<String>.filled(maxColumns, ''));
    }

    for (final row in matrix) {
      if (row.length < maxColumns) {
        row.addAll(List<String>.filled(maxColumns - row.length, ''));
      }
    }

    return matrix;
  }
}

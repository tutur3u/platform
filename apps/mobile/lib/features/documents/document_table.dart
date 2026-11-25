/// Edits a TipTap `table` node as the web's table extension stores it.
///
/// A table is `table > tableRow > (tableHeader | tableCell)`, each cell
/// holding `{colspan, rowspan, colwidth}` and paragraph content. Edits keep
/// every cell the user did not change exactly as stored (marks, extra
/// paragraphs, widths), and new cells take the web's defaults.
library;

import 'dart:convert';
import 'dart:math';

/// The attributes the web gives a new cell.
Map<String, dynamic> _defaultCellAttrs() => {
  'colspan': 1,
  'rowspan': 1,
  'colwidth': null,
};

/// A paragraph as the web's editor writes it (`textAlign` is part of its
/// schema).
Map<String, dynamic> _paragraph(String text, [Map<String, dynamic>? attrs]) => {
  'type': 'paragraph',
  'attrs': attrs ?? {'textAlign': null},
  if (text.isNotEmpty)
    'content': [
      {'type': 'text', 'text': text},
    ],
};

Map<String, dynamic> _cell(String type) => {
  'type': type,
  'attrs': _defaultCellAttrs(),
  'content': [_paragraph('')],
};

/// The table the web toolbar inserts: [rows] by [cols], the first row
/// made of header cells when [headerRow] is set.
Map<String, dynamic> newDocumentTable({
  int rows = 3,
  int cols = 3,
  bool headerRow = true,
}) => {
  'type': 'table',
  'content': [
    for (var r = 0; r < rows; r++)
      {
        'type': 'tableRow',
        'content': [
          for (var c = 0; c < cols; c++)
            _cell(headerRow && r == 0 ? 'tableHeader' : 'tableCell'),
        ],
      },
  ],
};

/// A table being edited: its rows of cells, each a stored cell node.
class DocumentTable {
  DocumentTable._(this._base, this.rows, this._rowNodes);

  /// Reads a stored `table` node.
  factory DocumentTable.fromNode(Map<String, dynamic> node) {
    final rows = <List<Map<String, dynamic>>>[];
    final rowNodes = <Map<String, dynamic>?>[];
    for (final row in _maps(node['content'])) {
      if (row['type'] != 'tableRow') continue;
      rowNodes.add(row);
      rows.add([
        for (final cell in _maps(row['content']))
          if (cell['type'] == 'tableHeader' || cell['type'] == 'tableCell')
            cell,
      ]);
    }
    return DocumentTable._(node, rows, rowNodes);
  }

  final Map<String, dynamic> _base;

  /// Each row's stored node, or null for a row added here, so a row keeps
  /// its stored keys wherever it moves.
  final List<Map<String, dynamic>?> _rowNodes;

  /// Each row's cell nodes. Unedited cells are the stored maps.
  final List<List<Map<String, dynamic>>> rows;

  int get rowCount => rows.length;
  int get columnCount =>
      rows.fold(0, (most, row) => row.length > most ? row.length : most);

  /// Whether any cell spans several rows or columns. Adding or removing
  /// rows and columns needs a plain grid, so merged tables only take text
  /// edits.
  bool get hasMergedCells => rows.any(
    (row) => row.any((cell) {
      final attrs = cell['attrs'];
      if (attrs is! Map) return false;
      return _span(attrs['colspan']) > 1 || _span(attrs['rowspan']) > 1;
    }),
  );

  /// Whether the first row is made of header cells.
  bool get hasHeaderRow =>
      rows.isNotEmpty &&
      rows.first.isNotEmpty &&
      rows.first.every((cell) => cell['type'] == 'tableHeader');

  /// The plain text of the cell at [row], [col]: its paragraphs, one per
  /// line.
  String textAt(int row, int col) {
    if (row >= rows.length || col >= rows[row].length) return '';
    return [
      for (final block in _maps(rows[row][col]['content'])) _plainText(block),
    ].join('\n');
  }

  /// Whether the cell's text can be edited here without losing anything:
  /// paragraphs of unformatted text that share one set of attributes.
  /// Marks, mentions, breaks, lists and other blocks keep a cell read-only,
  /// to be edited on the web.
  bool isPlainCell(int row, int col) {
    if (row >= rows.length || col >= rows[row].length) return false;
    final blocks = _maps(rows[row][col]['content']);
    final attrs = blocks.isEmpty ? null : jsonEncode(blocks.first['attrs']);
    for (final block in blocks) {
      if (block['type'] != 'paragraph') return false;
      if (jsonEncode(block['attrs']) != attrs) return false;
      for (final inline in _maps(block['content'])) {
        if (inline['type'] != 'text') return false;
        final marks = inline['marks'];
        if (marks is List && marks.isNotEmpty) return false;
      }
    }
    return true;
  }

  /// Sets the cell's text. A cell whose text is unchanged, or that is not
  /// [isPlainCell], stays as stored.
  void setText(int row, int col, String text) {
    if (row >= rows.length || col >= rows[row].length) return;
    if (textAt(row, col) == text || !isPlainCell(row, col)) return;
    final cell = rows[row][col];
    final first = _maps(cell['content']).firstOrNull;
    final attrs = first != null && first['type'] == 'paragraph'
        ? (first['attrs'] as Map?)?.cast<String, dynamic>()
        : null;
    rows[row][col] = {
      ...cell,
      'content': [for (final line in text.split('\n')) _paragraph(line, attrs)],
    };
  }

  /// Adds an empty row after [index] (or at the end).
  void addRow([int? index]) {
    final at = ((index ?? rows.length - 1) + 1).clamp(0, rows.length);
    final columns = columnCount == 0 ? 1 : columnCount;
    rows.insert(at, [for (var c = 0; c < columns; c++) _cell('tableCell')]);
    _rowNodes.insert(at, null);
  }

  /// Removes the row at [index]; the last row stays.
  void removeRow(int index) {
    if (rows.length <= 1 || index < 0 || index >= rows.length) return;
    rows.removeAt(index);
    _rowNodes.removeAt(index);
  }

  /// Adds an empty column after [index] (or at the end). A header row's
  /// new cell is a header cell, as the web adds it.
  void addColumn([int? index]) {
    final at = (index ?? columnCount - 1) + 1;
    for (var r = 0; r < rows.length; r++) {
      final header =
          rows[r].isNotEmpty &&
          rows[r].every((cell) => cell['type'] == 'tableHeader');
      rows[r].insert(
        at.clamp(0, rows[r].length),
        _cell(header ? 'tableHeader' : 'tableCell'),
      );
    }
  }

  /// Removes the column at [index]; the last column stays.
  void removeColumn(int index) {
    if (columnCount <= 1) return;
    for (final row in rows) {
      if (index >= 0 && index < row.length) row.removeAt(index);
    }
  }

  /// Turns the first row into header cells or back, as the web's
  /// toggleHeaderRow does.
  void toggleHeaderRow() {
    if (rows.isEmpty) return;
    final type = hasHeaderRow ? 'tableCell' : 'tableHeader';
    rows[0] = [
      for (final cell in rows.first)
        if (cell['type'] == type) cell else {...cell, 'type': type},
    ];
  }

  /// The table node to store. Rows and the table keep their stored keys.
  Map<String, dynamic> toNode() => {
    ..._base,
    'content': [
      for (var r = 0; r < rows.length; r++)
        {...?_rowNodes[r], 'type': 'tableRow', 'content': rows[r]},
    ],
  };

  /// The cells laid out on a grid, honouring `colspan` and `rowspan` as
  /// the web's table does. Each slot names the cell covering it.
  List<List<DocumentTableSlot?>> grid() {
    final slots = <List<DocumentTableSlot?>>[];
    void ensure(int row, int col) {
      while (slots.length <= row) {
        slots.add([]);
      }
      final line = slots[row];
      while (line.length <= col) {
        line.add(null);
      }
    }

    for (var r = 0; r < rows.length; r++) {
      var g = 0;
      for (var c = 0; c < rows[r].length; c++) {
        ensure(r, g);
        while (slots[r][g] != null) {
          g++;
          ensure(r, g);
        }
        final attrs = rows[r][c]['attrs'];
        final colspan = attrs is Map ? _span(attrs['colspan']) : 1;
        final rowspan = attrs is Map ? _span(attrs['rowspan']) : 1;
        for (var dr = 0; dr < rowspan; dr++) {
          for (var dc = 0; dc < colspan; dc++) {
            ensure(r + dr, g + dc);
            slots[r + dr][g + dc] = DocumentTableSlot(
              row: r,
              col: c,
              origin: dr == 0 && dc == 0,
              lastRow: dr == rowspan - 1,
              lastCol: dc == colspan - 1,
            );
          }
        }
        g += colspan;
      }
    }
    final width = slots.fold(0, (most, row) => max(most, row.length));
    for (final row in slots) {
      while (row.length < width) {
        row.add(null);
      }
    }
    return slots;
  }
}

/// One grid position of a table and the cell covering it.
class DocumentTableSlot {
  const DocumentTableSlot({
    required this.row,
    required this.col,
    required this.origin,
    required this.lastRow,
    required this.lastCol,
  });

  /// The covering cell, as indices into [DocumentTable.rows].
  final int row;
  final int col;

  /// Whether this is the cell's top-left position, which shows its text.
  final bool origin;

  /// Whether the cell ends here, so a border follows below or after it.
  final bool lastRow;
  final bool lastCol;
}

int _span(Object? value) => value is num && value >= 1 ? value.toInt() : 1;

List<Map<String, dynamic>> _maps(Object? content) => [
  if (content is List)
    for (final item in content)
      if (item is Map) item.cast<String, dynamic>(),
];

String _plainText(Map<String, dynamic> node) {
  if (node['type'] == 'text') return node['text'] as String? ?? '';
  if (node['type'] == 'hardBreak') return '\n';
  return [for (final child in _maps(node['content'])) _plainText(child)].join();
}

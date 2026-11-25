import 'dart:convert';

/// One Quill line: its ops up to and including the newline that ends it,
/// with adjacent text runs of the same style merged so the same content
/// always has the same [key].
class DocumentLine {
  DocumentLine._(this.ops, this.kind) : key = jsonEncode(ops);

  final List<Map<String, dynamic>> ops;

  /// The JSON of [ops], for comparing lines.
  final String key;

  /// The block a line continues across neighbours (`bullet`, `ordered`,
  /// `task`, `code` or `quote`), or null. Two adjacent lines of the same
  /// kind convert into one TipTap node.
  final String? kind;
}

/// Splits Quill delta [ops] (as JSON) into lines. Ops after the last
/// newline, which Quill never produces, are dropped.
List<DocumentLine> documentLines(List<dynamic> ops) {
  final lines = <DocumentLine>[];
  var current = <Map<String, dynamic>>[];

  void add(Object insert, Map<String, dynamic>? attrs) {
    final hasAttrs = attrs != null && attrs.isNotEmpty;
    if (insert is String && current.isNotEmpty) {
      final last = current.last;
      if (last['insert'] is String &&
          jsonEncode(last['attributes']) ==
              jsonEncode(hasAttrs ? attrs : null)) {
        current[current.length - 1] = {
          ...last,
          'insert': '${last['insert']}$insert',
        };
        return;
      }
    }
    current.add({'insert': insert, if (hasAttrs) 'attributes': attrs});
  }

  for (final raw in ops) {
    if (raw is! Map) continue;
    final insert = raw['insert'];
    final attrs = _sorted(raw['attributes']);
    if (insert is! String) {
      if (insert != null) add(insert as Object, attrs);
      continue;
    }
    final parts = insert.split('\n');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].isNotEmpty) add(parts[i], attrs);
      if (i == parts.length - 1) break;
      final newline = <String, dynamic>{
        'insert': '\n',
        if (attrs != null && attrs.isNotEmpty) 'attributes': attrs,
      };
      lines.add(DocumentLine._([...current, newline], _kind(attrs)));
      current = [];
    }
  }
  return lines;
}

/// [attributes] with sorted keys, so equal styles encode equally.
Map<String, dynamic>? _sorted(Object? attributes) {
  if (attributes is! Map || attributes.isEmpty) return null;
  final keys = attributes.keys.cast<String>().toList()..sort();
  return {for (final key in keys) key: attributes[key]};
}

String? _kind(Map<String, dynamic>? attrs) {
  if (attrs == null) return null;
  final list = attrs['list'];
  if (list == 'checked' || list == 'unchecked') return 'task';
  if (list is String) return list;
  if (attrs['code-block'] == true) return 'code';
  if (attrs['blockquote'] == true) return 'quote';
  return null;
}

/// A stored block and the lines it loaded as.
class AlignedBlock<T> {
  AlignedBlock(this.node, this.lines, {this.lossless = false});

  final T node;
  final List<DocumentLine> lines;

  /// Whether converting [lines] back gives [node] exactly, so the block can
  /// join an adjacent edit without losing anything.
  final bool lossless;
}

/// One piece of the saved document: an unedited stored block, or a run of
/// current lines to convert.
sealed class AlignedPiece<T> {}

class KeptBlock<T> extends AlignedPiece<T> {
  KeptBlock(this.node);

  final T node;
}

class EditedLines<T> extends AlignedPiece<T> {
  EditedLines(this.lines, this.replaced);

  final List<DocumentLine> lines;

  /// The stored blocks these lines stand in for (edited or joined), in
  /// order, so their attributes can carry over to the converted nodes.
  final List<T> replaced;
}

/// Above this many block-by-line cells, only the unedited head and tail
/// are kept and the middle is written as edited.
const int _alignmentBudget = 400000;

/// Aligns stored [blocks] with the editor's [current] lines.
///
/// A block is kept when its lines appear unchanged, in order; every other
/// current line is edited. Blocks that loaded as no lines (nothing Quill
/// can show) keep their place among their neighbours. A kept block that
/// continues into lines the user added (a list or code block extended by a
/// new line) joins them when that loses nothing, so the saved node is one
/// list, not two. A kept block never joins the edited lines of another
/// stored block, so two separate lists stay separate.
List<AlignedPiece<T>> alignDocumentLines<T>(
  List<AlignedBlock<T>> blocks,
  List<DocumentLine> current,
) {
  final visible = [
    for (var i = 0; i < blocks.length; i++)
      if (blocks[i].lines.isNotEmpty) i,
  ];
  final matchAt = _match(blocks, visible, current);

  final pieces = <_Piece<T>>[];
  var line = 0;
  var nextBlock = 0;

  // Emits the gap before the kept block [end] (or the document end): the
  // edited lines up to [lineEnd], with the blocks the gap replaces, and
  // the invisible blocks in their original order around them.
  void gap(int end, int lineEnd) {
    final edited = <AlignedBlock<T>>[];
    final before = <T>[];
    final after = <T>[];
    for (var i = nextBlock; i < end; i++) {
      final block = blocks[i];
      if (block.lines.isNotEmpty) {
        edited.add(block);
      } else {
        (edited.isEmpty ? before : after).add(block.node);
      }
    }
    pieces.addAll([for (final node in before) _Piece<T>.invisible(node)]);
    if (line < lineEnd) {
      pieces.add(
        _Piece<T>.edited(current.sublist(line, lineEnd), [
          for (final block in edited) block,
        ]),
      );
    } else if (edited.isNotEmpty) {
      pieces.add(_Piece<T>.edited(const [], edited));
    }
    pieces.addAll([for (final node in after) _Piece<T>.invisible(node)]);
    line = lineEnd;
  }

  for (final (index, at) in matchAt) {
    gap(index, at);
    final block = blocks[index];
    pieces.add(_Piece<T>.kept(block));
    line += block.lines.length;
    nextBlock = index + 1;
  }
  gap(blocks.length, current.length);

  _joinContinuedBlocks(pieces);

  final result = <AlignedPiece<T>>[];
  for (final piece in pieces) {
    switch (piece) {
      case _Piece(:final lines?, :final replaced):
        if (result.lastOrNull case EditedLines<T>(
          lines: final run,
          replaced: final nodes,
        )) {
          run.addAll(lines);
          nodes.addAll(replaced.map((block) => block.node));
        } else {
          result.add(
            EditedLines<T>(
              [...lines],
              [for (final block in replaced) block.node],
            ),
          );
        }
      case _Piece(:final block?):
        result.add(KeptBlock<T>(block.node));
      case _Piece(:final node):
        result.add(KeptBlock<T>(node as T));
    }
  }
  return result;
}

/// A lossless kept block joins an adjacent edited run when its edge line
/// continues the run's edge line (the same list, code or quote kind) and
/// that edge does not belong to another stored block of the same kind,
/// which would merge two separate blocks. Repeats until stable.
void _joinContinuedBlocks<T>(List<_Piece<T>> pieces) {
  bool continues(_Piece<T>? run, String? kind, {required bool runBefore}) {
    if (kind == null || run == null || run.lines == null) return false;
    final lines = run.lines!;
    if (lines.isEmpty) return false;
    final edge = runBefore ? lines.last : lines.first;
    if (edge.kind != kind) return false;
    final neighbour = runBefore
        ? run.replaced.lastOrNull?.lines.last
        : run.replaced.firstOrNull?.lines.first;
    return neighbour?.kind != kind;
  }

  var changed = true;
  while (changed) {
    changed = false;
    for (var i = 0; i < pieces.length; i++) {
      final block = pieces[i].block;
      if (block == null || !block.lossless) continue;
      final before = i > 0 ? pieces[i - 1] : null;
      final after = i + 1 < pieces.length ? pieces[i + 1] : null;
      if (!continues(before, block.lines.first.kind, runBefore: true) &&
          !continues(after, block.lines.last.kind, runBefore: false)) {
        continue;
      }
      pieces[i] = _Piece<T>.edited(block.lines, [block]);
      changed = true;
    }
  }
}

class _Piece<T> {
  _Piece.kept(AlignedBlock<T> this.block)
    : node = null,
      lines = null,
      replaced = const [];
  _Piece.invisible(this.node) : block = null, lines = null, replaced = const [];
  _Piece.edited(List<DocumentLine> this.lines, this.replaced)
    : block = null,
      node = null;

  /// The kept block, while it may still join an edited run.
  final AlignedBlock<T>? block;

  /// An invisible stored block, kept in place.
  final T? node;

  /// Edited lines, possibly none when blocks were deleted.
  final List<DocumentLine>? lines;

  /// The stored blocks the edited lines stand in for.
  final List<AlignedBlock<T>> replaced;
}

/// The kept blocks, as (block index, first current line), in order.
List<(int, int)> _match<T>(
  List<AlignedBlock<T>> blocks,
  List<int> visible,
  List<DocumentLine> current,
) {
  bool matches(int block, int at) {
    final lines = blocks[block].lines;
    if (at + lines.length > current.length) return false;
    for (var k = 0; k < lines.length; k++) {
      if (current[at + k].key != lines[k].key) return false;
    }
    return true;
  }

  // Unedited head and tail.
  final head = <(int, int)>[];
  var h = 0;
  var at = 0;
  while (h < visible.length && matches(visible[h], at)) {
    head.add((visible[h], at));
    at += blocks[visible[h]].lines.length;
    h++;
  }
  final tail = <(int, int)>[];
  var t = visible.length;
  var end = current.length;
  while (t > h) {
    final start = end - blocks[visible[t - 1]].lines.length;
    if (start < at || !matches(visible[t - 1], start)) break;
    tail.insert(0, (visible[t - 1], start));
    end = start;
    t--;
  }

  final rows = t - h;
  final cols = end - at;
  if (rows == 0 || (rows + 1) * (cols + 1) > _alignmentBudget) {
    return [...head, ...tail];
  }

  // best[i][j]: most kept lines using visible blocks h+i.. and lines at+j..
  final width = cols + 1;
  final best = List<int>.filled((rows + 1) * width, 0);
  int length(int i) => blocks[visible[h + i]].lines.length;
  bool fits(int i, int j) =>
      j + length(i) <= cols && matches(visible[h + i], at + j);
  for (var i = rows - 1; i >= 0; i--) {
    for (var j = cols; j >= 0; j--) {
      var value = best[(i + 1) * width + j];
      if (j < cols && best[i * width + j + 1] > value) {
        value = best[i * width + j + 1];
      }
      if (fits(i, j)) {
        final take = length(i) + best[(i + 1) * width + j + length(i)];
        if (take > value) value = take;
      }
      best[i * width + j] = value;
    }
  }

  final middle = <(int, int)>[];
  var i = 0;
  var j = 0;
  while (i < rows && j <= cols) {
    if (fits(i, j) &&
        length(i) + best[(i + 1) * width + j + length(i)] ==
            best[i * width + j]) {
      middle.add((visible[h + i], at + j));
      j += length(i);
      i++;
    } else if (j < cols && best[i * width + j + 1] == best[i * width + j]) {
      j++;
    } else {
      i++;
    }
  }
  return [...head, ...middle, ...tail];
}

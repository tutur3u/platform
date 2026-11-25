import 'dart:convert';

import 'package:dart_quill_delta/dart_quill_delta.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/utils/tiptap_document_codec.dart';
import 'package:mobile/features/documents/document_line_alignment.dart';
import 'package:mobile/features/tasks_boards/utils/quill_to_tiptap_converter.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_to_quill_converter.dart';

/// A document's content as loaded, so a save can write every block the
/// user did not edit back exactly as the web stored it.
///
/// Quill cannot model all of TipTap (nested blocks in list items, code
/// block languages, indeterminate tasks, link targets). Converting the
/// whole document on each save would drop those details from blocks the
/// user never touched. Instead each top-level block remembers the Quill
/// lines it loaded as. A save aligns the editor's lines with those blocks
/// ([alignDocumentLines]): a block whose lines are unchanged is written
/// verbatim, and only edited lines are converted.
class DocumentContentSnapshot {
  DocumentContentSnapshot._({
    required this.raw,
    required this.document,
    required this.delta,
    required List<AlignedBlock<Map<String, dynamic>>> blocks,
  }) : _blocks = blocks;

  /// Parses stored document [content] (TipTap JSON or plain text).
  factory DocumentContentSnapshot.parse(String content) {
    final decoded = decodeTipTapDescription(content);
    final doc = decoded.document;
    if (doc == null) {
      return DocumentContentSnapshot._(
        raw: content,
        document: null,
        delta: tipTapJsonToQuillDelta(content, opaqueNodes: true),
        blocks: const [],
      );
    }
    final delta = Delta();
    final nodes = _nodes(doc['content']);
    final own = <List<DocumentLine>>[];
    for (final node in nodes) {
      final ops = tipTapBlockToQuillDelta(
        node,
        dividerEmbeds: true,
        themeColorKeys: true,
        opaqueNodes: true,
      ).toList()..forEach(delta.push);
      own.add(documentLines([for (final op in ops) op.toJson()]));
    }
    if (delta.isEmpty || !_endsWithNewline(delta)) delta.insert('\n');

    // Each block's lines as the editor holds them, so a save compares like
    // with like. Quill normalises the loaded delta; when that keeps the
    // line count, the loaded lines are split by each block's count.
    final loaded = documentLines(Document.fromDelta(delta).toDelta().toJson());
    final counts = [for (final lines in own) lines.length];
    final sameShape = loaded.length == counts.fold(0, (a, b) => a + b);
    final blocks = <AlignedBlock<Map<String, dynamic>>>[];
    var at = 0;
    for (var i = 0; i < nodes.length; i++) {
      final lines = sameShape ? loaded.sublist(at, at + counts[i]) : own[i];
      at += counts[i];
      final back = quillOpsToTipTapNodes([for (final l in lines) ...l.ops]);
      blocks.add(
        AlignedBlock(
          nodes[i],
          lines,
          lossless:
              jsonEncode(_withoutNulls(back)) ==
              jsonEncode(_withoutNulls([nodes[i]])),
        ),
      );
    }
    return DocumentContentSnapshot._(
      raw: content,
      document: doc,
      delta: delta,
      blocks: blocks,
    );
  }

  /// The stored content, unchanged.
  final String raw;

  /// The stored TipTap document, or null when the content was plain text.
  final Map<String, dynamic>? document;

  /// The Quill delta the editor starts from.
  final Delta delta;

  final List<AlignedBlock<Map<String, dynamic>>> _blocks;

  /// The loaded delta as a Quill document normalises it, for spotting an
  /// unedited editor.
  late final String _baseline = jsonEncode(toQuill().toDelta().toJson());

  /// A fresh editable Quill document for this content.
  Document toQuill() => Document.fromDelta(delta);

  /// The TipTap document to save for the editor's [current] content.
  Map<String, dynamic> payloadFor(Document current) {
    final original = document;
    final ops = current.toDelta().toJson();
    if (original != null && jsonEncode(ops) == _baseline) return original;
    if (_isBlank(current)) return _doc(original, const []);
    final lines = documentLines(ops);
    if (original == null) return _doc(null, _convert(lines));
    return _doc(original, [
      for (final piece in alignDocumentLines(_blocks, lines))
        ...switch (piece) {
          KeptBlock(:final node) => [node],
          EditedLines(:final lines, :final replaced) => _carryAttrs(
            _convert(lines),
            replaced,
          ),
        },
    ]);
  }
}

/// [value] without null attributes or empty attribute maps, which TipTap
/// treats as defaults.
Object? _withoutNulls(Object? value) {
  if (value is List) return [for (final item in value) _withoutNulls(item)];
  if (value is! Map) return value;
  final result = <String, Object?>{};
  for (final MapEntry(:key, value: child) in value.entries) {
    if (child == null) continue;
    final cleaned = _withoutNulls(child);
    if (key == 'attrs' && cleaned is Map && cleaned.isEmpty) continue;
    result['$key'] = cleaned;
  }
  return result;
}

/// Stored attributes Quill cannot hold, by node type. Anything Quill
/// shows (alignment, heading level, checked state) comes from the editor,
/// so an edit that clears it is saved.
const Map<String, Set<String>> _carriedAttrs = {
  'codeBlock': {'language'},
  'orderedList': {'start', 'type'},
};

/// Edited blocks keep the stored attributes in [_carriedAttrs] (a code
/// block's language, an ordered list's start).
///
/// When the edit leaves the same blocks in the same order, each edited
/// block takes its stored counterpart's attributes. Otherwise a type with
/// exactly one stored block passes its attributes to every edited block of
/// that type, so a code block or list split in two (by a divider, say)
/// keeps its language, and the later parts of a split ordered list
/// continue its numbering. Types with several stored blocks carry nothing,
/// since which one an edited block came from is unknown.
List<Map<String, dynamic>> _carryAttrs(
  List<Map<String, dynamic>> converted,
  List<Map<String, dynamic>> replaced,
) {
  if (converted.length == replaced.length) {
    return [
      for (var i = 0; i < converted.length; i++)
        _withCarried(converted[i], replaced[i]),
    ];
  }
  final sources = <String, Map<String, dynamic>?>{};
  for (final node in replaced) {
    final type = node['type'];
    if (type is! String || !_carriedAttrs.containsKey(type)) continue;
    sources[type] = sources.containsKey(type) ? null : node;
  }
  final nextStart = <String, int>{};
  return [
    for (final node in converted)
      if (sources[node['type']] case final source?)
        _continued(_withCarried(node, source), nextStart)
      else
        node,
  ];
}

/// A later part of a split ordered list starts where the earlier part
/// ended.
Map<String, dynamic> _continued(
  Map<String, dynamic> node,
  Map<String, int> nextStart,
) {
  if (node['type'] != 'orderedList') return node;
  final attrs = (node['attrs'] as Map?)?.cast<String, dynamic>() ?? {};
  final stored = attrs['start'];
  final start =
      nextStart['orderedList'] ?? (stored is num ? stored.toInt() : 1);
  final items = node['content'] is List ? (node['content'] as List).length : 0;
  nextStart['orderedList'] = start + items;
  if (start == stored || (stored == null && start == 1)) return node;
  return {
    ...node,
    'attrs': {...attrs, 'start': start},
  };
}

Map<String, dynamic> _withCarried(
  Map<String, dynamic> now,
  Map<String, dynamic> stored,
) {
  final keys = _carriedAttrs[now['type']];
  final storedAttrs = stored['attrs'];
  if (keys == null || now['type'] != stored['type'] || storedAttrs is! Map) {
    return now;
  }
  final carried = {
    for (final key in keys)
      if (storedAttrs.containsKey(key)) key: storedAttrs[key],
  };
  if (carried.isEmpty) return now;
  return {
    ...now,
    'attrs': {...carried, ...?(now['attrs'] as Map?)?.cast<String, dynamic>()},
  };
}

/// TipTap nodes for edited [lines].
List<Map<String, dynamic>> _convert(List<DocumentLine> lines) =>
    quillOpsToTipTapNodes([for (final line in lines) ...line.ops]);

/// An editor holding nothing but its final newline.
bool _isBlank(Document document) {
  final ops = document.toDelta().toList();
  return ops.length == 1 &&
      ops.single.data == '\n' &&
      (ops.single.attributes?.isEmpty ?? true);
}

Map<String, dynamic> _doc(
  Map<String, dynamic>? original,
  List<Map<String, dynamic>> content,
) => {...?original, 'type': 'doc', 'content': content};

List<Map<String, dynamic>> _nodes(Object? content) => [
  if (content is List)
    for (final node in content)
      if (node is Map<String, dynamic>) node,
];

bool _endsWithNewline(Delta delta) {
  if (delta.isEmpty) return false;
  final data = delta.last.data;
  return data is String && data.endsWith('\n');
}

/// The editable Quill document for stored document [content].
Document documentQuillFromContent(String content) =>
    DocumentContentSnapshot.parse(content).toQuill();

/// TipTap JSON object for the documents API. An empty editor still sends an
/// empty document so a cleared body replaces the previous content. With the
/// loaded [snapshot], blocks the user did not edit are written verbatim.
Object documentContentPayload(
  Document document, [
  DocumentContentSnapshot? snapshot,
]) => (snapshot ?? DocumentContentSnapshot.parse('')).payloadFor(document);

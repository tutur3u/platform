import 'dart:convert';

import 'package:dart_quill_delta/dart_quill_delta.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/utils/tiptap_document_codec.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_quill_marks.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_quill_models.dart'
    show taskDescriptionDividerEmbedType;

/// TipTap node types that sit inside a text block.
const Set<String> _inlineNodeTypes = {
  'text',
  'hardBreak',
  'image',
  'imageResize',
  'mention',
  'video',
  'youtube',
};

/// Whether the conversion in progress renders horizontal rules as divider
/// embeds. Conversion is synchronous, so one flag serves each call.
bool _dividerEmbeds = false;

/// A TipTap description as an editable Quill document.
///
/// [dividerEmbeds] renders horizontal rules as a
/// [taskDescriptionDividerEmbedType] embed; only surfaces that register a
/// divider embed builder may pass it. Otherwise a rule reads as `---`.
Document tipTapJsonToQuillDocument(
  String? rawDescription, {
  bool dividerEmbeds = false,
}) => Document.fromDelta(
  tipTapJsonToQuillDelta(rawDescription, dividerEmbeds: dividerEmbeds),
);

/// A TipTap description as a Quill delta: TipTap JSON when it parses,
/// otherwise the raw text. Always ends with a newline, as Quill requires.
Delta tipTapJsonToQuillDelta(
  String? rawDescription, {
  bool dividerEmbeds = false,
}) {
  final decoded = decodeTipTapDescription(rawDescription);
  if (decoded.isEmpty) {
    return Delta()..insert('\n');
  }

  final doc = decoded.document;
  if (doc == null) {
    return Delta()..insert('${decoded.trimmed}\n');
  }

  final previous = _dividerEmbeds;
  _dividerEmbeds = dividerEmbeds;
  try {
    return _tipTapDocToDelta(doc);
  } finally {
    _dividerEmbeds = previous;
  }
}

Delta _tipTapDocToDelta(Map<String, dynamic> doc) {
  final delta = Delta();
  final content = _objectList(doc['content']);

  for (final node in content) {
    _appendBlockNodeToDelta(node, delta);
  }

  if (delta.isEmpty || !_deltaEndsWithNewLine(delta)) {
    delta.insert('\n');
  }

  return delta;
}

void _appendBlockNodeToDelta(Object? node, Delta delta, {int indent = 0}) {
  if (node is! Map<String, dynamic>) {
    return;
  }

  final type = node['type'];
  final attrs = _objectMap(node['attrs']);

  if (type == 'paragraph') {
    _appendInlineContentToDelta(node['content'], delta);
    final lineAttrs = _lineAttrsWithTextAlign(attrs);
    delta.insert('\n', lineAttrs.isEmpty ? null : lineAttrs);
    return;
  }

  if (type == 'heading') {
    _appendInlineContentToDelta(node['content'], delta);
    final level = attrs?['level'];
    final normalizedLevel = switch (level) {
      final num value => value.toInt().clamp(1, 6),
      _ => 1,
    };
    delta.insert(
      '\n',
      _lineAttrsWithTextAlign(attrs, {'header': normalizedLevel}),
    );
    return;
  }

  if (type == 'blockquote') {
    final quoteContent = _objectList(node['content']);
    if (quoteContent.isEmpty) {
      delta.insert('\n', {'blockquote': true});
      return;
    }

    for (final quoteNode in quoteContent) {
      if (quoteNode is Map<String, dynamic> &&
          quoteNode['type'] == 'paragraph') {
        _appendInlineContentToDelta(quoteNode['content'], delta);
        delta.insert('\n', {'blockquote': true});
      } else {
        _appendBlockNodeToDelta(quoteNode, delta);
      }
    }
    return;
  }

  if (type == 'codeBlock') {
    final text = _flattenTipTapText(node['content']);
    for (final line in text.split('\n')) {
      if (line.isNotEmpty) {
        delta.insert(line);
      }
      delta.insert('\n', {'code-block': true});
    }
    return;
  }

  if (type == 'table') {
    delta
      ..insert({'table': jsonEncode(node)})
      ..insert('\n');
    return;
  }

  if (type == 'bulletList' || type == 'orderedList') {
    final listItems = _objectList(node['content']);
    final listKind = type == 'orderedList' ? 'ordered' : 'bullet';
    for (final item in listItems) {
      if (item is! Map<String, dynamic> || item['type'] != 'listItem') {
        continue;
      }

      final itemParagraphs = _objectList(item['content']);
      if (itemParagraphs.isEmpty) {
        final lineAttrs = <String, dynamic>{'list': listKind};
        if (indent > 0) lineAttrs['indent'] = indent;
        delta.insert('\n', lineAttrs);
        continue;
      }

      for (final paragraph in itemParagraphs) {
        if (paragraph is Map<String, dynamic> &&
            paragraph['type'] == 'paragraph') {
          _appendInlineContentToDelta(paragraph['content'], delta);
          final lineAttrs = _lineAttrsWithTextAlign(
            _objectMap(paragraph['attrs']),
            {'list': listKind},
          );
          if (indent > 0) lineAttrs['indent'] = indent;
          delta.insert('\n', lineAttrs);
        } else {
          _appendBlockNodeToDelta(paragraph, delta, indent: indent + 1);
        }
      }
    }
    return;
  }

  if (type == 'taskList') {
    final items = _objectList(node['content']);
    for (final item in items) {
      if (item is! Map<String, dynamic> || item['type'] != 'taskItem') {
        continue;
      }

      final checked = _objectMap(item['attrs'])?['checked'] == true;
      final listKind = checked ? 'checked' : 'unchecked';
      final itemParagraphs = _objectList(item['content']);
      if (itemParagraphs.isEmpty) {
        final lineAttrs = <String, dynamic>{'list': listKind};
        if (indent > 0) lineAttrs['indent'] = indent;
        delta.insert('\n', lineAttrs);
        continue;
      }

      for (final paragraph in itemParagraphs) {
        if (paragraph is Map<String, dynamic> &&
            paragraph['type'] == 'paragraph') {
          _appendInlineContentToDelta(paragraph['content'], delta);
          final lineAttrs = _lineAttrsWithTextAlign(
            _objectMap(paragraph['attrs']),
            {'list': listKind},
          );
          if (indent > 0) lineAttrs['indent'] = indent;
          delta.insert('\n', lineAttrs);
        } else {
          _appendBlockNodeToDelta(paragraph, delta, indent: indent + 1);
        }
      }
    }
    return;
  }

  if (type == 'image' || type == 'imageResize') {
    final payload = _quillImageEmbedValue(attrs);
    if (payload != null) {
      delta
        ..insert({'image': payload})
        ..insert('\n');
    }
    return;
  }

  if (type == 'video' || type == 'youtube') {
    final attrs = _objectMap(node['attrs']);
    final src =
        (_stringOrNull(attrs?['src']) ?? _stringOrNull(attrs?['videoId']))
            ?.trim() ??
        '';
    if (src.isNotEmpty) {
      delta
        ..insert({'video': src})
        ..insert('\n');
    }
    return;
  }

  if (type == 'horizontalRule') {
    delta
      ..insert(_dividerEmbeds ? {taskDescriptionDividerEmbedType: 'hr'} : '---')
      ..insert('\n');
    return;
  }

  // A toggle block (details) shows its summary, then its content, open:
  // Quill has no collapsible block, and hiding the content would hide
  // text the web shows one tap away.
  if (type == 'details' || type == 'detailsContent') {
    for (final child in _objectList(node['content'])) {
      _appendBlockNodeToDelta(child, delta, indent: indent);
    }
    return;
  }

  if (type == 'detailsSummary') {
    final level = switch (attrs?['level']) {
      final num value when value >= 1 => value.toInt().clamp(1, 6),
      _ => null,
    };
    _appendInlineContentToDelta(
      node['content'],
      delta,
      extraAttrs: level == null ? const {'bold': true} : const {},
    );
    delta.insert('\n', level == null ? null : {'header': level});
    return;
  }

  // Unknown containers keep their nested blocks instead of dropping them.
  final children = _objectList(node['content']);
  final hasBlockChildren = children.any(
    (child) =>
        child is Map<String, dynamic> &&
        !_inlineNodeTypes.contains(child['type']),
  );
  if (hasBlockChildren) {
    // Loose inline runs between the blocks read as their own lines.
    final inlineRun = <Object?>[];
    void flushInlineRun() {
      if (inlineRun.isEmpty) return;
      _appendInlineContentToDelta(List<Object?>.of(inlineRun), delta);
      delta.insert('\n');
      inlineRun.clear();
    }

    for (final child in children) {
      if (child is Map<String, dynamic> &&
          _inlineNodeTypes.contains(child['type'])) {
        inlineRun.add(child);
      } else {
        flushInlineRun();
        _appendBlockNodeToDelta(child, delta, indent: indent);
      }
    }
    flushInlineRun();
    return;
  }

  _appendInlineContentToDelta(node['content'], delta);
  final lineAttrs = _lineAttrsWithTextAlign(attrs);
  delta.insert('\n', lineAttrs.isEmpty ? null : lineAttrs);
}

void _appendInlineContentToDelta(
  Object? content,
  Delta delta, {
  Map<String, dynamic> extraAttrs = const {},
}) {
  final nodes = _objectList(content);
  for (final child in nodes) {
    if (child is! Map<String, dynamic>) {
      continue;
    }

    final type = child['type'];
    if (type == 'text') {
      final text = _stringOrNull(child['text']);
      if (text == null || text.isEmpty) {
        continue;
      }
      final attrs = {
        ...extraAttrs,
        ...quillAttrsFromTipTapMarks(child['marks']),
      };
      if (attrs.isEmpty) {
        delta.insert(text);
      } else {
        delta.insert(text, attrs);
      }
      continue;
    }

    if (type == 'hardBreak') {
      delta.insert('\n');
      continue;
    }

    if (type == 'image' || type == 'imageResize') {
      final payload = _quillImageEmbedValue(_objectMap(child['attrs']));
      if (payload != null) {
        delta.insert({'image': payload});
      }
      continue;
    }

    if (type == 'mention') {
      final attrs = child['attrs'];
      final payload = attrs is Map<String, dynamic> ? jsonEncode(attrs) : '{}';
      delta.insert({'mention': payload});
      continue;
    }

    if (type == 'video') {
      final src =
          _stringOrNull(_objectMap(child['attrs'])?['src'])?.trim() ?? '';
      if (src.isNotEmpty) {
        delta.insert({'video': src});
      }
      continue;
    }

    if (type == 'youtube') {
      final attrs = _objectMap(child['attrs']);
      final src =
          (_stringOrNull(attrs?['src']) ?? _stringOrNull(attrs?['videoId']))
              ?.trim() ??
          '';
      if (src.isNotEmpty) {
        delta.insert({'video': src});
      }
      continue;
    }
  }
}

Map<String, dynamic> _lineAttrsWithTextAlign(
  Map<Object?, Object?>? attrs, [
  Map<String, dynamic> base = const <String, dynamic>{},
]) {
  final lineAttrs = <String, dynamic>{...base};
  final textAlign = _stringOrNull(attrs?['textAlign'])?.trim();
  if (textAlign != null && textAlign.isNotEmpty) {
    lineAttrs['align'] = textAlign;
  }
  return lineAttrs;
}

String? _quillImageEmbedValue(Map<Object?, Object?>? attrs) {
  final src = _stringOrNull(attrs?['src'])?.trim() ?? '';
  if (src.isEmpty) {
    return null;
  }

  final alt = _stringOrNull(attrs?['alt'])?.trim();
  final title = _stringOrNull(attrs?['title'])?.trim();
  final width = attrs?['width'];
  final height = attrs?['height'];
  final containerStyle = _stringOrNull(attrs?['containerStyle'])?.trim();
  final wrapperStyle = _stringOrNull(attrs?['wrapperStyle'])?.trim();

  final hasExtraAttrs =
      (alt != null && alt.isNotEmpty) ||
      (title != null && title.isNotEmpty) ||
      width != null ||
      height != null ||
      (containerStyle != null && containerStyle.isNotEmpty) ||
      (wrapperStyle != null && wrapperStyle.isNotEmpty);

  if (!hasExtraAttrs) {
    return src;
  }

  return jsonEncode({
    'src': src,
    'alt': alt,
    'title': title,
    'width': width,
    'height': height,
    'containerStyle': containerStyle ?? '',
    'wrapperStyle': wrapperStyle ?? '',
  });
}

String _flattenTipTapText(Object? nodesValue) {
  final nodes = _objectList(nodesValue);
  final buffer = StringBuffer();
  for (final node in nodes) {
    if (node is! Map<String, dynamic>) {
      continue;
    }
    final type = node['type'];
    if (type == 'text') {
      buffer.write(_stringOrNull(node['text']) ?? '');
    } else {
      buffer.write(_flattenTipTapText(node['content']));
    }
  }
  return buffer.toString();
}

List<Object?> _objectList(Object? value) {
  return value is List ? value : const [];
}

Map<Object?, Object?>? _objectMap(Object? value) {
  return value is Map ? value : null;
}

String? _stringOrNull(Object? value) {
  return value is String ? value : null;
}

bool _deltaEndsWithNewLine(Delta delta) {
  if (delta.isEmpty) {
    return false;
  }

  final last = delta.last;
  final value = last.data;
  if (value is! String) {
    return false;
  }

  return value.endsWith('\n');
}

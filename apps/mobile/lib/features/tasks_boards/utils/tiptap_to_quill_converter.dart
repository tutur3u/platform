import 'dart:convert';

import 'package:dart_quill_delta/dart_quill_delta.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/utils/tiptap_document_codec.dart';

Document tipTapJsonToQuillDocument(String? rawDescription) {
  final decoded = decodeTipTapDescription(rawDescription);
  if (decoded.isEmpty) {
    return Document();
  }

  final doc = decoded.document;
  if (doc != null) {
    final delta = _tipTapDocToDelta(doc);
    return Document.fromDelta(delta);
  }

  return Document()..insert(0, decoded.trimmed);
}

Delta _tipTapDocToDelta(Map<String, dynamic> doc) {
  final delta = Delta();
  final content = (doc['content'] as List?)?.cast<Object?>() ?? const [];

  for (final node in content) {
    _appendBlockNodeToDelta(node, delta);
  }

  if (delta.isEmpty || !_deltaEndsWithNewLine(delta)) {
    delta.insert('\n');
  }

  return delta;
}

void _appendBlockNodeToDelta(
  Object? node,
  Delta delta, {
  int indent = 0,
}) {
  if (node is! Map<String, dynamic>) {
    return;
  }

  final type = node['type'];

  if (type == 'paragraph') {
    _appendInlineContentToDelta(node['content'], delta);
    delta.insert('\n');
    return;
  }

  if (type == 'heading') {
    _appendInlineContentToDelta(node['content'], delta);
    final level = (node['attrs'] as Map?)?['level'];
    final normalizedLevel = switch (level) {
      final num value => value.toInt().clamp(1, 6),
      _ => 1,
    };
    delta.insert('\n', {'header': normalizedLevel});
    return;
  }

  if (type == 'blockquote') {
    final quoteContent =
        (node['content'] as List?)?.cast<Object?>() ?? const [];
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
    final listItems = (node['content'] as List?)?.cast<Object?>() ?? const [];
    final listKind = type == 'orderedList' ? 'ordered' : 'bullet';
    for (final item in listItems) {
      if (item is! Map<String, dynamic> || item['type'] != 'listItem') {
        continue;
      }

      final itemParagraphs =
          (item['content'] as List?)?.cast<Object?>() ?? const [];
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
          final lineAttrs = <String, dynamic>{'list': listKind};
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
    final items = (node['content'] as List?)?.cast<Object?>() ?? const [];
    for (final item in items) {
      if (item is! Map<String, dynamic> || item['type'] != 'taskItem') {
        continue;
      }

      final checked = (item['attrs'] as Map?)?['checked'] == true;
      final listKind = checked ? 'checked' : 'unchecked';
      final itemParagraphs =
          (item['content'] as List?)?.cast<Object?>() ?? const [];
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
          final lineAttrs = <String, dynamic>{'list': listKind};
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
    final src = ((node['attrs'] as Map?)?['src'] as String?)?.trim() ?? '';
    if (src.isNotEmpty) {
      delta
        ..insert({'image': src})
        ..insert('\n');
    }
    return;
  }

  if (type == 'video' || type == 'youtube') {
    final attrs = node['attrs'] as Map?;
    final src =
        ((attrs?['src'] as String?) ?? (attrs?['videoId'] as String?))
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
      ..insert('---')
      ..insert('\n');
    return;
  }

  _appendInlineContentToDelta(node['content'], delta);
  delta.insert('\n');
}

void _appendInlineContentToDelta(Object? content, Delta delta) {
  final nodes = (content as List?)?.cast<Object?>() ?? const [];
  for (final child in nodes) {
    if (child is! Map<String, dynamic>) {
      continue;
    }

    final type = child['type'];
    if (type == 'text') {
      final text = child['text'] as String?;
      if (text == null || text.isEmpty) {
        continue;
      }
      final attrs = _quillAttrsFromTipTapMarks(child['marks']);
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
      final src = ((child['attrs'] as Map?)?['src'] as String?)?.trim() ?? '';
      if (src.isNotEmpty) {
        delta.insert({'image': src});
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
      final src = ((child['attrs'] as Map?)?['src'] as String?)?.trim() ?? '';
      if (src.isNotEmpty) {
        delta.insert({'video': src});
      }
      continue;
    }

    if (type == 'youtube') {
      final attrs = child['attrs'] as Map?;
      final src =
          ((attrs?['src'] as String?) ?? (attrs?['videoId'] as String?))
              ?.trim() ??
          '';
      if (src.isNotEmpty) {
        delta.insert({'video': src});
      }
      continue;
    }
  }
}

Map<String, dynamic> _quillAttrsFromTipTapMarks(Object? marksValue) {
  final marks = (marksValue as List?)?.cast<Object?>() ?? const [];
  final attrs = <String, dynamic>{};

  for (final mark in marks) {
    if (mark is! Map<String, dynamic>) {
      continue;
    }

    final type = mark['type'];
    if (type == 'bold') {
      attrs['bold'] = true;
    } else if (type == 'italic') {
      attrs['italic'] = true;
    } else if (type == 'strike') {
      attrs['strike'] = true;
    } else if (type == 'underline') {
      attrs['underline'] = true;
    } else if (type == 'code') {
      attrs['code'] = true;
    } else if (type == 'subscript') {
      attrs['script'] = 'sub';
    } else if (type == 'superscript') {
      attrs['script'] = 'super';
    } else if (type == 'highlight') {
      attrs['background'] =
          ((mark['attrs'] as Map?)?['color'] as String?) ?? '#FFF59D';
    } else if (type == 'link') {
      final href = (mark['attrs'] as Map?)?['href'];
      if (href is String && href.trim().isNotEmpty) {
        attrs['link'] = href;
      }
    }
  }

  return attrs;
}

String _flattenTipTapText(Object? nodesValue) {
  final nodes = (nodesValue as List?)?.cast<Object?>() ?? const [];
  final buffer = StringBuffer();
  for (final node in nodes) {
    if (node is! Map<String, dynamic>) {
      continue;
    }
    final type = node['type'];
    if (type == 'text') {
      buffer.write(node['text'] as String? ?? '');
    } else {
      buffer.write(_flattenTipTapText(node['content']));
    }
  }
  return buffer.toString();
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

import 'dart:convert';

import 'package:dart_quill_delta/dart_quill_delta.dart';
import 'package:flutter_quill/flutter_quill.dart';

String? quillDocumentToTipTapJson(Document document) {
  final ops = document.toDelta().toJson();
  final doc = _quillOpsToTipTapDoc(ops);
  if (_isTipTapDocEmpty(doc)) {
    return null;
  }
  return jsonEncode(doc);
}

Document tipTapJsonToQuillDocument(String? rawDescription) {
  final raw = rawDescription?.trim() ?? '';
  if (raw.isEmpty) {
    return Document();
  }

  try {
    final parsed = jsonDecode(raw);
    if (parsed is Map<String, dynamic> && parsed['type'] == 'doc') {
      final delta = _tipTapDocToDelta(parsed);
      return Document.fromDelta(delta);
    }
  } on FormatException {
    // Fall back to plain text representation.
  }

  return Document()..insert(0, raw);
}

Map<String, dynamic> _quillOpsToTipTapDoc(List<dynamic> ops) {
  final lines = <_QuillLine>[];
  var current = const _QuillLine();

  void pushCurrentLine(Map<String, dynamic> attrs) {
    lines.add(current.copyWith(lineAttrs: attrs));
    current = const _QuillLine();
  }

  for (final rawOp in ops) {
    if (rawOp is! Map<String, dynamic>) {
      continue;
    }

    final insert = rawOp['insert'];
    final attrs =
        (rawOp['attributes'] as Map?)?.cast<String, dynamic>() ??
        const <String, dynamic>{};

    if (insert is String) {
      final chunks = insert.split('\n');
      for (var i = 0; i < chunks.length; i++) {
        final text = chunks[i];
        if (text.isNotEmpty) {
          current = current.copyWith(
            segments: [
              ...current.segments,
              _QuillSegment.text(text: text, attrs: attrs),
            ],
          );
        }
        if (i < chunks.length - 1) {
          pushCurrentLine(attrs);
        }
      }
      continue;
    }

    if (insert is Map<String, dynamic>) {
      final image = insert['image'];
      if (image is String && image.trim().isNotEmpty) {
        current = current.copyWith(
          segments: [
            ...current.segments,
            _QuillSegment.image(src: image),
          ],
        );
        continue;
      }

      final video = insert['video'];
      if (video is String && video.trim().isNotEmpty) {
        current = current.copyWith(
          segments: [
            ...current.segments,
            _QuillSegment.video(src: video),
          ],
        );
      }
    }
  }

  if (current.segments.isNotEmpty) {
    lines.add(current);
  }

  final nodes = _mergeAdjacentListNodes(
    lines.map(_lineToTipTapNode).whereType<Map<String, dynamic>>().toList(),
  );

  return <String, dynamic>{
    'type': 'doc',
    'content': nodes,
  };
}

Map<String, dynamic>? _lineToTipTapNode(_QuillLine line) {
  final inlineNodes = _lineSegmentsToTipTapInlineNodes(line.segments);
  final attrs = line.lineAttrs;

  if ((attrs['header'] as num?) != null) {
    final level = (attrs['header'] as num?)?.toInt() ?? 1;
    return {
      'type': 'heading',
      'attrs': {'level': level.clamp(1, 6)},
      'content': inlineNodes,
    };
  }

  if (attrs['blockquote'] == true) {
    return {
      'type': 'blockquote',
      'content': [
        {
          'type': 'paragraph',
          'content': inlineNodes,
        },
      ],
    };
  }

  if (attrs['code-block'] == true) {
    final text = line.segments
        .where((segment) => segment.kind == _QuillSegmentKind.text)
        .map((segment) => segment.text ?? '')
        .join();
    return {
      'type': 'codeBlock',
      'content': text.isEmpty
          ? <Map<String, dynamic>>[]
          : [
              {'type': 'text', 'text': text},
            ],
    };
  }

  if (attrs['list'] is String) {
    final listValue = attrs['list'] as String;
    if (listValue == 'checked' || listValue == 'unchecked') {
      return {
        'type': 'taskList',
        'content': [
          {
            'type': 'taskItem',
            'attrs': {'checked': listValue == 'checked'},
            'content': [
              {'type': 'paragraph', 'content': inlineNodes},
            ],
          },
        ],
      };
    }

    final listType = listValue == 'ordered' ? 'orderedList' : 'bulletList';
    return {
      'type': listType,
      'content': [
        {
          'type': 'listItem',
          'content': [
            {'type': 'paragraph', 'content': inlineNodes},
          ],
        },
      ],
    };
  }

  if (inlineNodes.isEmpty) {
    return null;
  }

  return {
    'type': 'paragraph',
    'content': inlineNodes,
  };
}

List<Map<String, dynamic>> _lineSegmentsToTipTapInlineNodes(
  List<_QuillSegment> segments,
) {
  final nodes = <Map<String, dynamic>>[];

  for (final segment in segments) {
    if (segment.kind == _QuillSegmentKind.text) {
      final text = segment.text ?? '';
      if (text.isEmpty) {
        continue;
      }

      final marks = _marksFromQuillAttrs(segment.attrs);
      final node = <String, dynamic>{'type': 'text', 'text': text};
      if (marks.isNotEmpty) {
        node['marks'] = marks;
      }
      nodes.add(node);
      continue;
    }

    if (segment.kind == _QuillSegmentKind.image) {
      final src = segment.src?.trim() ?? '';
      if (src.isEmpty) {
        continue;
      }
      nodes.add({
        'type': 'image',
        'attrs': {'src': src},
      });
      continue;
    }

    if (segment.kind == _QuillSegmentKind.video) {
      final src = segment.src?.trim() ?? '';
      if (src.isEmpty) {
        continue;
      }
      nodes.add({
        'type': 'video',
        'attrs': {'src': src},
      });
    }
  }

  return nodes;
}

List<Map<String, dynamic>> _marksFromQuillAttrs(Map<String, dynamic> attrs) {
  final marks = <Map<String, dynamic>>[];

  if (attrs['bold'] == true) {
    marks.add({'type': 'bold'});
  }
  if (attrs['italic'] == true) {
    marks.add({'type': 'italic'});
  }
  if (attrs['strike'] == true) {
    marks.add({'type': 'strike'});
  }
  if (attrs['code'] == true) {
    marks.add({'type': 'code'});
  }

  final link = attrs['link'];
  if (link is String && link.trim().isNotEmpty) {
    marks.add({
      'type': 'link',
      'attrs': {'href': link},
    });
  }

  return marks;
}

List<Map<String, dynamic>> _mergeAdjacentListNodes(
  List<Map<String, dynamic>> nodes,
) {
  final merged = <Map<String, dynamic>>[];
  for (final node in nodes) {
    if (merged.isNotEmpty) {
      final previous = merged.last;
      final currentType = node['type'];
      final previousType = previous['type'];

      if ((currentType == 'bulletList' || currentType == 'orderedList') &&
          currentType == previousType) {
        final previousContent =
            (previous['content'] as List?)?.cast<Map<String, dynamic>>() ??
            <Map<String, dynamic>>[];
        final currentContent =
            (node['content'] as List?)?.cast<Map<String, dynamic>>() ??
            <Map<String, dynamic>>[];
        previous['content'] = [...previousContent, ...currentContent];
        continue;
      }

      if (currentType == 'taskList' && previousType == 'taskList') {
        final previousContent =
            (previous['content'] as List?)?.cast<Map<String, dynamic>>() ??
            <Map<String, dynamic>>[];
        final currentContent =
            (node['content'] as List?)?.cast<Map<String, dynamic>>() ??
            <Map<String, dynamic>>[];
        previous['content'] = [...previousContent, ...currentContent];
        continue;
      }
    }

    merged.add(node);
  }

  return merged;
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

void _appendBlockNodeToDelta(Object? node, Delta delta) {
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
    if (text.isNotEmpty) {
      delta.insert(text);
    }
    delta.insert('\n', {'code-block': true});
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
        delta.insert('\n', {'list': listKind});
        continue;
      }

      for (final paragraph in itemParagraphs) {
        if (paragraph is Map<String, dynamic> &&
            paragraph['type'] == 'paragraph') {
          _appendInlineContentToDelta(paragraph['content'], delta);
          delta.insert('\n', {'list': listKind});
        } else {
          _appendBlockNodeToDelta(paragraph, delta);
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
        delta.insert('\n', {'list': listKind});
        continue;
      }

      for (final paragraph in itemParagraphs) {
        if (paragraph is Map<String, dynamic> &&
            paragraph['type'] == 'paragraph') {
          _appendInlineContentToDelta(paragraph['content'], delta);
          delta.insert('\n', {'list': listKind});
        } else {
          _appendBlockNodeToDelta(paragraph, delta);
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

    if (type == 'video') {
      final src = ((child['attrs'] as Map?)?['src'] as String?)?.trim() ?? '';
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
    } else if (type == 'code') {
      attrs['code'] = true;
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
  if (last.data is! String) {
    return false;
  }
  final value = last.data;
  if (value is! String) {
    return false;
  }

  return value.endsWith('\n');
}

bool _isTipTapDocEmpty(Map<String, dynamic> node) {
  if (node['type'] == 'text') {
    final text = (node['text'] as String?)?.trim() ?? '';
    return text.isEmpty;
  }

  final type = node['type'];
  if (type == 'image' ||
      type == 'imageResize' ||
      type == 'video' ||
      type == 'youtube' ||
      type == 'mention' ||
      type == 'horizontalRule') {
    return false;
  }

  final content = (node['content'] as List?)?.cast<Object?>() ?? const [];
  if (content.isEmpty) {
    return true;
  }

  return content.every((child) {
    if (child is! Map<String, dynamic>) {
      return true;
    }
    return _isTipTapDocEmpty(child);
  });
}

class _QuillLine {
  const _QuillLine({
    this.segments = const [],
    this.lineAttrs = const <String, dynamic>{},
  });

  final List<_QuillSegment> segments;
  final Map<String, dynamic> lineAttrs;

  _QuillLine copyWith({
    List<_QuillSegment>? segments,
    Map<String, dynamic>? lineAttrs,
  }) {
    return _QuillLine(
      segments: segments ?? this.segments,
      lineAttrs: lineAttrs ?? this.lineAttrs,
    );
  }
}

enum _QuillSegmentKind { text, image, video }

class _QuillSegment {
  const _QuillSegment._({
    required this.kind,
    this.text,
    this.attrs = const <String, dynamic>{},
    this.src,
  });

  const _QuillSegment.text({
    required String text,
    required Map<String, dynamic> attrs,
  }) : this._(kind: _QuillSegmentKind.text, text: text, attrs: attrs);

  const _QuillSegment.image({required String src})
    : this._(kind: _QuillSegmentKind.image, src: src);

  const _QuillSegment.video({required String src})
    : this._(kind: _QuillSegmentKind.video, src: src);

  final _QuillSegmentKind kind;
  final String? text;
  final Map<String, dynamic> attrs;
  final String? src;
}

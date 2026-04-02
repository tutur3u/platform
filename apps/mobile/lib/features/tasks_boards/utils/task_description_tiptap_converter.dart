import 'dart:convert';

import 'package:dart_quill_delta/dart_quill_delta.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/core/utils/tiptap_document_codec.dart';

String? quillDocumentToTipTapJson(Document document) {
  final ops = document.toDelta().toJson();
  final doc = _quillOpsToTipTapDoc(ops);
  if (_isTipTapDocEmpty(doc)) {
    return null;
  }
  return jsonEncode(doc);
}

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
        // An image block embed ends the current line
        pushCurrentLine(const <String, dynamic>{});
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
        // A video block embed ends the current line
        pushCurrentLine(const <String, dynamic>{});
        continue;
      }

      // Mention embed (inline – stays in the current line).
      final mention = insert['mention'];
      if (mention is String && mention.trim().isNotEmpty) {
        current = current.copyWith(
          segments: [
            ...current.segments,
            _QuillSegment.mention(data: mention),
          ],
        );
        continue;
      }

      // Table embed (block – ends the current line).
      final table = insert['table'];
      if (table is String && table.trim().isNotEmpty) {
        current = current.copyWith(
          segments: [
            ...current.segments,
            _QuillSegment.table(data: table),
          ],
        );
        pushCurrentLine(const <String, dynamic>{});
      }
    }
  }

  if (current.segments.isNotEmpty) {
    lines.add(current);
  }

  final nodes = _buildListTree(
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
  final textAlign = _extractTextAlign(attrs['align']);

  if ((attrs['header'] as num?) != null) {
    final level = (attrs['header'] as num?)?.toInt() ?? 1;
    return {
      'type': 'heading',
      'attrs': {
        'level': level.clamp(1, 6),
        if (textAlign != null) 'textAlign': textAlign,
      },
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
    final indent = (attrs['indent'] as num?)?.toInt() ?? 0;

    if (listValue == 'checked' || listValue == 'unchecked') {
      return {
        'type': 'taskList',
        if (indent > 0) '_indent': indent,
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
      if (indent > 0) '_indent': indent,
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

  // Image-only line (from embed): segments contain a single image
  if (inlineNodes.isEmpty &&
      line.segments.length == 1 &&
      line.segments.first.kind == _QuillSegmentKind.image) {
    final src = line.segments.first.src ?? '';
    if (src.isNotEmpty) {
      return {
        'type': 'imageResize',
        'attrs': {
          'src': src,
          'alt': null,
          'title': null,
          'width': 500,
          'height': null,
          'containerStyle': '',
          'wrapperStyle': '',
        },
      };
    }
    return null;
  }

  // Video-only line (from embed)
  if (inlineNodes.isEmpty &&
      line.segments.length == 1 &&
      line.segments.first.kind == _QuillSegmentKind.video) {
    final src = line.segments.first.src ?? '';
    if (src.isNotEmpty) {
      return {
        'type': 'video',
        'attrs': {'src': src},
      };
    }
    return null;
  }

  // Table-only line (from embed): restore the full TipTap table node.
  if (inlineNodes.isEmpty &&
      line.segments.length == 1 &&
      line.segments.first.kind == _QuillSegmentKind.table) {
    final data = line.segments.first.src ?? '';
    if (data.isNotEmpty) {
      try {
        final decoded = jsonDecode(data);
        if (decoded is Map<String, dynamic> && decoded['type'] == 'table') {
          return decoded;
        }
      } on Object {
        // Ignore malformed table data.
      }
    }
    return null;
  }

  if (inlineNodes.isEmpty) {
    return null;
  }

  return {
    'type': 'paragraph',
    if (textAlign != null) 'attrs': {'textAlign': textAlign},
    'content': inlineNodes,
  };
}

String? _extractTextAlign(Object? alignValue) {
  if (alignValue is! String) {
    return null;
  }
  final normalized = alignValue.trim().toLowerCase();
  if (normalized == 'center' || normalized == 'right' || normalized == 'left') {
    return normalized;
  }
  if (normalized == 'justify') {
    return 'left';
  }
  return null;
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

    // Mention embeds are inline – convert back to TipTap mention nodes.
    if (segment.kind == _QuillSegmentKind.mention) {
      final data = segment.src ?? '';
      if (data.isEmpty) continue;
      try {
        final attrs = jsonDecode(data);
        if (attrs is Map<String, dynamic>) {
          nodes.add({'type': 'mention', 'attrs': attrs});
        }
      } on Object {
        // Ignore malformed mention data.
      }
      continue;
    }

    // Image, video, and table embeds are handled at the line level.
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
  if (attrs['underline'] == true) {
    marks.add({'type': 'underline'});
  }
  if (attrs['code'] == true) {
    marks.add({'type': 'code'});
  }

  final script = attrs['script'];
  if (script == 'sub') {
    marks.add({'type': 'subscript'});
  }
  if (script == 'super') {
    marks.add({'type': 'superscript'});
  }

  final background = attrs['background'];
  if (background is String && background.trim().isNotEmpty) {
    marks.add({
      'type': 'highlight',
      'attrs': {'color': background.trim()},
    });
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

/// Builds the final TipTap node list, merging adjacent same-type lists and
/// nesting indented list items into their parent list items.
List<Map<String, dynamic>> _buildListTree(List<Map<String, dynamic>> nodes) {
  final result = <Map<String, dynamic>>[];

  for (final rawNode in nodes) {
    final type = rawNode['type'];
    final isListNode =
        type == 'bulletList' || type == 'orderedList' || type == 'taskList';

    if (!isListNode) {
      result.add(rawNode);
      continue;
    }

    final indent = (rawNode['_indent'] as int?) ?? 0;
    // Strip the temporary Quill-indent metadata from the final TipTap node.
    final node = Map<String, dynamic>.from(rawNode)..remove('_indent');

    if (indent == 0) {
      // Top-level list: merge adjacent same-type lists.
      if (result.isNotEmpty && result.last['type'] == type) {
        _mergeListItems(result.last, node);
      } else {
        result.add(node);
      }
    } else {
      // Indented list: nest inside the last item of the nearest parent list.
      if (result.isNotEmpty) {
        final parent = result.last;
        if (parent['type'] == 'bulletList' ||
            parent['type'] == 'orderedList' ||
            parent['type'] == 'taskList') {
          _nestListIntoParent(parent, node, indent);
          continue;
        }
      }
      // No suitable parent found – add as top-level fallback.
      result.add(node);
    }
  }

  return result;
}

/// Appends the items from [source] into [target]'s content list.
void _mergeListItems(
  Map<String, dynamic> target,
  Map<String, dynamic> source,
) {
  final targetContent =
      (target['content'] as List?)?.cast<Map<String, dynamic>>() ?? [];
  final sourceContent =
      (source['content'] as List?)?.cast<Map<String, dynamic>>() ?? [];
  target['content'] = [...targetContent, ...sourceContent];
}

/// Recursively nests [child] list into the last item of [parent] at the
/// given [depth] (1 = direct child, 2 = grandchild, …).
void _nestListIntoParent(
  Map<String, dynamic> parent,
  Map<String, dynamic> child,
  int depth,
) {
  final parentContent = (parent['content'] as List?)
      ?.cast<Map<String, dynamic>>();
  if (parentContent == null || parentContent.isEmpty) return;

  final lastItem = parentContent.last;
  final lastItemContent = List<Map<String, dynamic>>.from(
    (lastItem['content'] as List?)?.cast<Map<String, dynamic>>() ?? [],
  );

  if (depth == 1) {
    // Try to merge with an existing sub-list of the same type at the end.
    if (lastItemContent.isNotEmpty &&
        lastItemContent.last['type'] == child['type']) {
      _mergeListItems(lastItemContent.last, child);
    } else {
      lastItemContent.add(child);
    }
    lastItem['content'] = lastItemContent;
  } else {
    // Go deeper – recurse into the last nested sub-list.
    final lastSubList = lastItemContent.lastWhere(
      (n) =>
          n['type'] == 'bulletList' ||
          n['type'] == 'orderedList' ||
          n['type'] == 'taskList',
      orElse: () => <String, dynamic>{},
    );

    if (lastSubList.isNotEmpty) {
      _nestListIntoParent(lastSubList, child, depth - 1);
      lastItem['content'] = lastItemContent;
    }
  }
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
    if (text.isNotEmpty) {
      delta.insert(text);
    }
    delta.insert('\n', {'code-block': true});
    return;
  }

  if (type == 'table') {
    // Store the full TipTap table node as a Quill block embed so the editor
    // can render it as a proper table widget.
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
          // Nested list or other block – increase indent level.
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
      // Store the full mention attrs as a Quill inline embed so the editor
      // can render the green mention chip inline.
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
  return !tipTapNodeHasContent(node);
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

enum _QuillSegmentKind { text, image, video, mention, table }

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

  /// Inline mention: [src] holds the JSON-encoded mention attrs map.
  const _QuillSegment.mention({required String data})
    : this._(kind: _QuillSegmentKind.mention, src: data);

  /// Block table: [src] holds the JSON-encoded full TipTap table node.
  const _QuillSegment.table({required String data})
    : this._(kind: _QuillSegmentKind.table, src: data);

  final _QuillSegmentKind kind;
  final String? text;
  final Map<String, dynamic> attrs;
  final String? src;
}

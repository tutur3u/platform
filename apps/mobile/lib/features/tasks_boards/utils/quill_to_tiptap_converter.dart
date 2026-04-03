import 'dart:convert';

import 'package:flutter_quill/flutter_quill.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_quill_models.dart';

String? quillDocumentToTipTapJson(Document document) {
  final ops = document.toDelta().toJson();
  final doc = _quillOpsToTipTapDoc(ops);
  if (isTipTapDocEmpty(doc)) {
    return null;
  }
  return jsonEncode(doc);
}

Map<String, dynamic> _quillOpsToTipTapDoc(List<dynamic> ops) {
  final lines = <QuillLine>[];
  var current = const QuillLine();

  void pushCurrentLine(Map<String, dynamic> attrs) {
    lines.add(current.copyWith(lineAttrs: attrs));
    current = const QuillLine();
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
              QuillSegment.text(text: text, attrs: attrs),
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
            QuillSegment.image(src: image),
          ],
        );
        pushCurrentLine(const <String, dynamic>{});
        continue;
      }

      final video = insert['video'];
      if (video is String && video.trim().isNotEmpty) {
        current = current.copyWith(
          segments: [
            ...current.segments,
            QuillSegment.video(src: video),
          ],
        );
        pushCurrentLine(const <String, dynamic>{});
        continue;
      }

      final mention = insert['mention'];
      if (mention is String && mention.trim().isNotEmpty) {
        current = current.copyWith(
          segments: [
            ...current.segments,
            QuillSegment.mention(data: mention),
          ],
        );
        continue;
      }

      final table = insert['table'];
      if (table is String && table.trim().isNotEmpty) {
        current = current.copyWith(
          segments: [
            ...current.segments,
            QuillSegment.table(data: table),
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

Map<String, dynamic>? _lineToTipTapNode(QuillLine line) {
  final inlineNodes = _lineSegmentsToTipTapInlineNodes(line.segments);
  final attrs = line.lineAttrs;
  final textAlign = extractTextAlign(attrs['align']);

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
        .where((segment) => segment.kind == QuillSegmentKind.text)
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

  if (inlineNodes.isEmpty &&
      line.segments.length == 1 &&
      line.segments.first.kind == QuillSegmentKind.image) {
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

  if (inlineNodes.isEmpty &&
      line.segments.length == 1 &&
      line.segments.first.kind == QuillSegmentKind.video) {
    final src = line.segments.first.src ?? '';
    if (src.isNotEmpty) {
      return {
        'type': 'video',
        'attrs': {'src': src},
      };
    }
    return null;
  }

  if (inlineNodes.isEmpty &&
      line.segments.length == 1 &&
      line.segments.first.kind == QuillSegmentKind.table) {
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

  return {
    'type': 'paragraph',
    if (textAlign != null) 'attrs': {'textAlign': textAlign},
    if (inlineNodes.isNotEmpty) 'content': inlineNodes,
  };
}

List<Map<String, dynamic>> _lineSegmentsToTipTapInlineNodes(
  List<QuillSegment> segments,
) {
  final nodes = <Map<String, dynamic>>[];

  for (final segment in segments) {
    if (segment.kind == QuillSegmentKind.text) {
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

    if (segment.kind == QuillSegmentKind.mention) {
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
    final node = Map<String, dynamic>.from(rawNode)..remove('_indent');

    if (indent == 0) {
      if (result.isNotEmpty && result.last['type'] == type) {
        _mergeListItems(result.last, node);
      } else {
        result.add(node);
      }
    } else {
      if (result.isNotEmpty) {
        final parent = result.last;
        if (parent['type'] == 'bulletList' ||
            parent['type'] == 'orderedList' ||
            parent['type'] == 'taskList') {
          _nestListIntoParent(parent, node, indent);
          continue;
        }
      }
      result.add(node);
    }
  }

  return result;
}

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
    if (lastItemContent.isNotEmpty &&
        lastItemContent.last['type'] == child['type']) {
      _mergeListItems(lastItemContent.last, child);
    } else {
      lastItemContent.add(child);
    }
    lastItem['content'] = lastItemContent;
  } else {
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
    } else {
      lastItemContent.add(_wrapListForDepth(child, depth - 1));
      lastItem['content'] = lastItemContent;
    }
  }
}

Map<String, dynamic> _wrapListForDepth(
  Map<String, dynamic> child,
  int depth,
) {
  if (depth <= 1) {
    return child;
  }

  final listType = child['type'] as String?;
  final itemType = listType == 'taskList' ? 'taskItem' : 'listItem';
  final item = <String, dynamic>{
    'type': itemType,
    'content': [
      <String, dynamic>{'type': 'paragraph'},
      _wrapListForDepth(child, depth - 1),
    ],
  };
  if (itemType == 'taskItem') {
    item['attrs'] = {'checked': false};
  }

  return {
    'type': listType,
    'content': [item],
  };
}

/// TipTap marks to Quill inline attributes, shared by the description
/// viewer and editor.
library;

import 'package:mobile/features/tasks_boards/utils/tiptap_quill_colors.dart';

export 'package:mobile/features/tasks_boards/utils/tiptap_quill_colors.dart';

/// Quill inline attributes for TipTap [marksValue]: bold, italic, strike,
/// underline, inline code, sub/superscript, highlight, text colour and
/// links.
///
/// Highlight and textStyle marks go through
/// [quillColorAttrsFromTipTapMarks]: [themeColorKeys] keeps theme colours
/// as palette keys for a surface that resolves them per theme (the
/// read-only viewer); editors get hex values.
Map<String, dynamic> quillAttrsFromTipTapMarks(
  Object? marksValue, {
  bool themeColorKeys = false,
}) {
  final marks = marksValue is List ? marksValue : const <Object?>[];
  final attrs = <String, dynamic>{};
  final colorMarks = <Map<Object?, Object?>>[];

  for (final mark in marks) {
    if (mark is! Map) continue;
    final markAttrs = mark['attrs'] is Map ? mark['attrs'] as Map : null;

    switch (mark['type']) {
      case 'bold':
        attrs['bold'] = true;
      case 'italic':
        attrs['italic'] = true;
      case 'strike':
        attrs['strike'] = true;
      case 'underline':
        attrs['underline'] = true;
      case 'code':
        attrs['code'] = true;
      case 'subscript':
        attrs['script'] = 'sub';
      case 'superscript':
        attrs['script'] = 'super';
      case 'highlight' || 'textStyle':
        colorMarks.add(mark);
      case 'link':
        final href = markAttrs?['href'];
        if (href is String && href.trim().isNotEmpty) {
          attrs['link'] = href.trim();
        }
    }
  }

  attrs.addAll(
    quillColorAttrsFromTipTapMarks(colorMarks, themeKeys: themeColorKeys),
  );
  return attrs;
}

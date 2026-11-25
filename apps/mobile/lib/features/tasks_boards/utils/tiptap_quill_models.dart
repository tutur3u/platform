import 'package:mobile/core/utils/tiptap_document_codec.dart';

/// The Quill embed type for a TipTap horizontal rule.
const String taskDescriptionDividerEmbedType = 'divider';

/// The Quill block embed that carries a TipTap block node mobile cannot
/// edit (a toggle, a bibliography, a YouTube frame or an unknown node),
/// JSON-encoded so saving writes it back verbatim.
const String tipTapBlockEmbedType = 'tiptap-block';

/// The inline counterpart of [tipTapBlockEmbedType], for inline atoms such
/// as citations.
const String tipTapInlineEmbedType = 'tiptap-inline';

class QuillLine {
  const QuillLine({
    this.segments = const [],
    this.lineAttrs = const <String, dynamic>{},
  });

  final List<QuillSegment> segments;
  final Map<String, dynamic> lineAttrs;

  QuillLine copyWith({
    List<QuillSegment>? segments,
    Map<String, dynamic>? lineAttrs,
  }) {
    return QuillLine(
      segments: segments ?? this.segments,
      lineAttrs: lineAttrs ?? this.lineAttrs,
    );
  }
}

enum QuillSegmentKind {
  text,
  image,
  video,
  mention,
  table,
  divider,
  opaqueBlock,
  opaqueInline,
}

class QuillSegment {
  const QuillSegment._({
    required this.kind,
    this.text,
    this.attrs = const <String, dynamic>{},
    this.src,
  });

  const QuillSegment.text({
    required String text,
    required Map<String, dynamic> attrs,
  }) : this._(kind: QuillSegmentKind.text, text: text, attrs: attrs);

  const QuillSegment.image({required String src})
    : this._(kind: QuillSegmentKind.image, src: src);

  const QuillSegment.video({required String src})
    : this._(kind: QuillSegmentKind.video, src: src);

  const QuillSegment.mention({required String data})
    : this._(kind: QuillSegmentKind.mention, src: data);

  const QuillSegment.table({required String data})
    : this._(kind: QuillSegmentKind.table, src: data);

  /// A horizontal rule.
  const QuillSegment.divider() : this._(kind: QuillSegmentKind.divider);

  /// A TipTap node carried verbatim, as JSON.
  const QuillSegment.opaque({required String data, required bool inline})
    : this._(
        kind: inline
            ? QuillSegmentKind.opaqueInline
            : QuillSegmentKind.opaqueBlock,
        src: data,
      );

  final QuillSegmentKind kind;
  final String? text;
  final Map<String, dynamic> attrs;
  final String? src;
}

String? extractTextAlign(Object? alignValue) {
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

bool isTipTapDocEmpty(Map<String, dynamic> node) {
  return !tipTapNodeHasContent(node);
}

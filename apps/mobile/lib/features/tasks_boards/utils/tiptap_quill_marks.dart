/// TipTap marks to Quill inline attributes, shared by the description
/// viewer and editor.
library;

/// The highlight colour TipTap's default highlight uses when it stores
/// none.
const String tipTapDefaultHighlightColor = '#FFF59D';

/// Quill inline attributes for TipTap [marksValue]: bold, italic, strike,
/// underline, inline code, sub/superscript, highlight, text colour and
/// links.
///
/// Quill only renders colours it can parse, and an unparsable colour
/// throws while the line paints, so colours pass through
/// [quillColorOrNull] and unsupported ones are dropped.
Map<String, dynamic> quillAttrsFromTipTapMarks(Object? marksValue) {
  final marks = marksValue is List ? marksValue : const <Object?>[];
  final attrs = <String, dynamic>{};

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
      case 'highlight':
        attrs['background'] =
            quillColorOrNull(markAttrs?['color']) ??
            tipTapDefaultHighlightColor;
        // The web's theme-aware highlight pins a readable text colour.
        if (quillColorOrNull(markAttrs?['textColor']) case final color?) {
          attrs['color'] = color;
        }
      case 'textStyle':
        if (quillColorOrNull(markAttrs?['color']) case final color?) {
          attrs['color'] = color;
        }
        if (quillColorOrNull(markAttrs?['backgroundColor'])
            case final background?) {
          attrs['background'] = background;
        }
      case 'link':
        final href = markAttrs?['href'];
        if (href is String && href.trim().isNotEmpty) {
          attrs['link'] = href.trim();
        }
    }
  }

  return attrs;
}

final RegExp _hexColor = RegExp(
  r'^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$',
  caseSensitive: false,
);
final RegExp _rgbColor = RegExp(
  r'^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$',
  caseSensitive: false,
);

/// [value] as a `#rrggbb` colour Quill can paint, or null. Accepts hex
/// and `rgb()`/`rgba()`; theme variables and colour names are dropped so
/// the text keeps the theme colour.
String? quillColorOrNull(Object? value) {
  if (value is! String) return null;
  final color = value.trim();
  if (color.isEmpty) return null;
  if (_hexColor.hasMatch(color)) return _sixDigitHex(color);

  final rgb = _rgbColor.firstMatch(color);
  if (rgb == null) return null;
  final channels = [
    for (var i = 1; i <= 3; i++) int.parse(rgb.group(i)!).clamp(0, 255),
  ];
  final alpha = double.tryParse(rgb.group(4) ?? '');
  // Mostly transparent colours read as no colour on either theme.
  if (alpha != null && alpha < 0.2) return null;
  return '#${channels.map((c) => c.toRadixString(16).padLeft(2, '0')).join()}';
}

/// Expands `#rgb`/`#rgba` and drops alpha so Quill reads the colour as
/// `#rrggbb`.
String _sixDigitHex(String color) {
  final digits = color.substring(1);
  if (digits.length == 3 || digits.length == 4) {
    return '#${digits.substring(0, 3).split('').map((d) => '$d$d').join()}'
        .toLowerCase();
  }
  return '#${digits.substring(0, 6)}'.toLowerCase();
}

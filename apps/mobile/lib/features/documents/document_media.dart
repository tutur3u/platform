/// Image and video nodes as the web documents editor stores them.
///
/// The web sizes an image against its editor's width and stores the
/// result in pixels. Mobile reads and writes widths against the same
/// reference the web falls back to (800px), so an image sized on either
/// platform takes the same share of the page on both.
library;

import 'dart:convert';
import 'dart:math';

/// The editor width the web measures image sizes against when it has none.
const double documentImageReferenceWidth = 800;

/// The web's image size presets, as a percentage of the editor width.
const Map<String, int> documentImageSizePresets = {
  'xs': 25,
  'sm': 40,
  'md': 60,
  'lg': 80,
  'xl': 100,
};

/// The Quill embed type documents use for images.
const String documentImageEmbedType = 'image';

/// A new `imageResize` node for an uploaded [src], at the web's default
/// size (60% of the editor).
Map<String, dynamic> newDocumentImageNode(String src) => {
  'type': 'imageResize',
  'attrs': {
    'src': src,
    'alt': null,
    'title': null,
    'width': _presetWidth(60),
    'height': null,
    'containerStyle': null,
    'wrapperStyle': null,
  },
};

/// A new `video` node for an uploaded [src].
Map<String, dynamic> newDocumentVideoNode(String src) => {
  'type': 'video',
  'attrs': {'src': src},
};

/// Whether [node] is an image node the documents editor can resize.
bool isDocumentImageNode(Object? node) =>
    node is Map &&
    (node['type'] == 'imageResize' || node['type'] == 'image') &&
    node['attrs'] is Map &&
    (node['attrs'] as Map)['src'] is String;

/// Reads an image embed value written by [documentImageEmbedValue], or
/// null for the bare-URL form task descriptions use.
Map<String, dynamic>? documentImageNodeFromEmbed(Object? data) {
  if (data is! String || !data.trimLeft().startsWith('{')) return null;
  try {
    final decoded = jsonDecode(data);
    if (isDocumentImageNode(decoded)) {
      return (decoded as Map).cast<String, dynamic>();
    }
  } on FormatException {
    // Not a stored node.
  }
  return null;
}

/// The embed value that carries a whole image [node], so saving writes
/// every attribute back as stored.
String documentImageEmbedValue(Map<String, dynamic> node) => jsonEncode(node);

/// The stored width of an image [node] in pixels, or null when it has none
/// (a number, or a `"320"`/`"320px"` string as the web's resize handle
/// writes it).
double? documentImageWidth(Map<String, dynamic> node) {
  final attrs = node['attrs'];
  if (attrs is! Map) return null;
  final width = _pixels(attrs['width']) ?? _styleWidth(attrs['containerStyle']);
  return width != null && width.isFinite && width > 0 ? width : null;
}

/// The share of the page an image [node] takes, from 0 to 1.
double documentImageFraction(Map<String, dynamic> node) {
  final width = documentImageWidth(node);
  if (width == null) return 1;
  return (width / documentImageReferenceWidth).clamp(0.1, 1).toDouble();
}

/// The preset closest to the image's width, as the web snaps it.
String documentImageSizePreset(Map<String, dynamic> node) {
  final percent = documentImageFraction(node) * 100;
  var best = 'md';
  var bestDiff = double.infinity;
  for (final MapEntry(:key, :value) in documentImageSizePresets.entries) {
    final diff = (percent - value).abs();
    if (diff < bestDiff) {
      bestDiff = diff;
      best = key;
    }
  }
  return best;
}

/// [node] resized to [preset]. The width a stored `containerStyle` sets is
/// updated too, since the web sizes the image from that style when it has
/// one.
Map<String, dynamic> resizeDocumentImage(
  Map<String, dynamic> node,
  String preset,
) {
  final width = _presetWidth(documentImageSizePresets[preset] ?? 60);
  final attrs = (node['attrs'] as Map).cast<String, dynamic>();
  final style = attrs['containerStyle'];
  return {
    ...node,
    'attrs': {
      ...attrs,
      'width': width,
      if (style is String && _widthPattern.hasMatch(style))
        'containerStyle': style.replaceFirst(
          _widthPattern,
          'width: ${width}px',
        ),
    },
  };
}

/// The web's upload file name: a timestamp, a random suffix and the
/// original extension.
String documentUploadFileName(String original, {Random? random, int? now}) {
  final dot = original.lastIndexOf('.');
  final ext = dot >= 0 && dot < original.length - 1
      ? original.substring(dot + 1)
      : original;
  final rng = random ?? Random.secure();
  const digits = '0123456789abcdefghijklmnopqrstuvwxyz';
  final suffix = String.fromCharCodes(
    List.generate(11, (_) => digits.codeUnitAt(rng.nextInt(digits.length))),
  );
  return '${now ?? DateTime.now().millisecondsSinceEpoch}-$suffix.$ext';
}

/// The stable sign-on-read URL the web stores for a workspace object.
String documentStorageShareUrl(String wsId, String path) =>
    '/api/v1/workspaces/${Uri.encodeComponent(wsId)}/storage/share?'
    'path=${formUrlEncode(path)}';

/// Encodes [value] as `URLSearchParams` does, so stored URLs match the
/// web's byte for byte.
String formUrlEncode(String value) {
  final out = StringBuffer();
  for (final byte in utf8.encode(value)) {
    final keep =
        (byte >= 0x30 && byte <= 0x39) ||
        (byte >= 0x41 && byte <= 0x5A) ||
        (byte >= 0x61 && byte <= 0x7A) ||
        byte == 0x2A ||
        byte == 0x2D ||
        byte == 0x2E ||
        byte == 0x5F;
    if (keep) {
      out.writeCharCode(byte);
    } else if (byte == 0x20) {
      out.write('+');
    } else {
      out.write('%${byte.toRadixString(16).toUpperCase().padLeft(2, '0')}');
    }
  }
  return out.toString();
}

final RegExp _widthPattern = RegExp(r'(?<![-\w])width:\s*[0-9.]+px');

double? _pixels(Object? value) => switch (value) {
  final num number => number.toDouble(),
  final String text => double.tryParse(
    text.trim().toLowerCase().replaceFirst(RegExp(r'px$'), ''),
  ),
  _ => null,
};

double? _styleWidth(Object? style) {
  if (style is! String) return null;
  final match = RegExp(r'(?<![-\w])width:\s*([0-9.]+)px').firstMatch(style);
  return match == null ? null : double.tryParse(match.group(1)!);
}

/// A preset's width in whole pixels, so it encodes as the web's number
/// does (`480`, not `480.0`).
int _presetWidth(int percent) =>
    (documentImageReferenceWidth * percent / 100).round();

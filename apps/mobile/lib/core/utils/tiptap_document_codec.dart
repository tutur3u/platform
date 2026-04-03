import 'dart:convert';

class DecodedTipTapDescription {
  const DecodedTipTapDescription({
    required this.trimmed,
    this.document,
  });

  final String trimmed;
  final Map<String, dynamic>? document;

  bool get isEmpty => trimmed.isEmpty;
  bool get isTipTapDocument => document != null;
}

DecodedTipTapDescription decodeTipTapDescription(String? rawDescription) {
  final trimmed = rawDescription?.trim() ?? '';
  if (trimmed.isEmpty) {
    return const DecodedTipTapDescription(trimmed: '');
  }

  if (!trimmed.startsWith('{')) {
    return DecodedTipTapDescription(trimmed: trimmed);
  }

  try {
    final decoded = jsonDecode(trimmed);
    if (decoded is Map<String, dynamic> && decoded['type'] == 'doc') {
      return DecodedTipTapDescription(trimmed: trimmed, document: decoded);
    }
  } on Object {
    // Fall through to plain-text representation.
  }

  return DecodedTipTapDescription(trimmed: trimmed);
}

String? normalizeTipTapDescriptionPayload(String raw) {
  final decoded = decodeTipTapDescription(raw);
  if (decoded.isEmpty) {
    return null;
  }

  final doc = decoded.document;
  if (doc == null) {
    return decoded.trimmed;
  }

  if (!tipTapNodeHasContent(doc)) {
    return null;
  }

  return jsonEncode(doc);
}

bool tipTapNodeHasContent(Object? node) {
  if (node is! Map<String, dynamic>) {
    return false;
  }

  final type = node['type'];
  if (type == 'text') {
    final text = (node['text'] as String?)?.trim() ?? '';
    return text.isNotEmpty;
  }

  if (type == 'image' ||
      type == 'imageResize' ||
      type == 'video' ||
      type == 'youtube' ||
      type == 'mention' ||
      type == 'horizontalRule') {
    return true;
  }

  final content = node['content'];
  if (content is! List) {
    return false;
  }

  for (final child in content) {
    if (tipTapNodeHasContent(child)) {
      return true;
    }
  }

  return false;
}

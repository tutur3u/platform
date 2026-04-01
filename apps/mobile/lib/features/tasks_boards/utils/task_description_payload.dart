import 'dart:convert';

String? normalizeTaskDescriptionPayload(String raw) {
  final normalizedText = _normalizeTaskText(raw);
  if (normalizedText == null) {
    return null;
  }

  try {
    final decoded = jsonDecode(normalizedText);
    if (decoded is Map<String, dynamic> && decoded['type'] == 'doc') {
      final hasContent = _tiptapNodeHasContent(decoded);
      if (!hasContent) {
        return null;
      }
      return jsonEncode(decoded);
    }
  } on FormatException {
    return normalizedText;
  }

  return normalizedText;
}

String? _normalizeTaskText(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  return trimmed;
}

bool _tiptapNodeHasContent(Object? node) {
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
    if (_tiptapNodeHasContent(child)) {
      return true;
    }
  }

  return false;
}

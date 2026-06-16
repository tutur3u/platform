import 'dart:convert';

enum _TipTapNodeContentState { empty, content, malformed }

class DecodedTipTapDescription {
  const DecodedTipTapDescription({required this.trimmed, this.document});

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
    final doc = _stringKeyedMap(decoded);
    if (doc != null && doc['type'] == 'doc') {
      return DecodedTipTapDescription(trimmed: trimmed, document: doc);
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

  return switch (_tipTapNodeContentState(doc)) {
    _TipTapNodeContentState.content => jsonEncode(doc),
    _TipTapNodeContentState.empty => null,
    _TipTapNodeContentState.malformed => decoded.trimmed,
  };
}

Map<String, dynamic>? _stringKeyedMap(Object? value) {
  if (value is! Map) return null;

  final result = <String, dynamic>{};
  for (final entry in value.entries) {
    final key = entry.key;
    if (key is String) {
      result[key] = entry.value;
    }
  }

  return result;
}

bool tipTapNodeHasContent(Object? node) {
  return _tipTapNodeContentState(node) == _TipTapNodeContentState.content;
}

_TipTapNodeContentState _tipTapNodeContentState(Object? node) {
  final nodeMap = _stringKeyedMap(node);
  if (nodeMap == null) {
    return _TipTapNodeContentState.malformed;
  }

  final type = nodeMap['type'];
  if (type is! String) {
    return _TipTapNodeContentState.malformed;
  }

  if (type == 'text') {
    final text = nodeMap['text'];
    if (text == null) {
      return _TipTapNodeContentState.empty;
    }
    if (text is! String) {
      return _TipTapNodeContentState.malformed;
    }
    return text.trim().isNotEmpty
        ? _TipTapNodeContentState.content
        : _TipTapNodeContentState.empty;
  }

  if (type == 'image' ||
      type == 'imageResize' ||
      type == 'video' ||
      type == 'youtube' ||
      type == 'mention' ||
      type == 'horizontalRule') {
    return _TipTapNodeContentState.content;
  }

  final content = nodeMap['content'];
  if (content == null) {
    return _TipTapNodeContentState.empty;
  }
  if (content is! List) {
    return _TipTapNodeContentState.malformed;
  }

  var hasContent = false;
  for (final child in content) {
    final childState = _tipTapNodeContentState(child);
    if (childState == _TipTapNodeContentState.malformed) {
      return _TipTapNodeContentState.malformed;
    }
    if (childState == _TipTapNodeContentState.content) {
      hasContent = true;
    }
  }

  return hasContent
      ? _TipTapNodeContentState.content
      : _TipTapNodeContentState.empty;
}

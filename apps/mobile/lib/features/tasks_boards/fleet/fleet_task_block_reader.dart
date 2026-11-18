import 'dart:convert';

final _bareUrl = RegExp('^https?://', caseSensitive: false);

const _blockMarker = 'fleet:v1';
const _topLevelKeys = {
  'status',
  'state',
  'owner',
  'product',
  'priority',
  'eta',
  'last_update',
  'needs_user',
  'needs_user_reason',
  'blocked_by',
  'links',
};

/// Lowercase key with spaces and hyphens turned into underscores.
String normalizeFleetKey(String? raw) =>
    (raw ?? '').trim().toLowerCase().replaceAll(RegExp(r'[\s-]+'), '_');

/// The key/value lines of a `fleet:v1` block.
class FleetBlock {
  const FleetBlock({required this.fields, required this.links});

  final Map<String, String> fields;
  final List<({String kind, String value})> links;
}

/// The block in [description], or null when there is none.
FleetBlock? readFleetBlock(String? description) {
  if (description == null || !description.contains(_blockMarker)) return null;
  final lines = _flattenDescription(description);
  final open = RegExp(r'^(?:<!--\s*)?fleet:v1(?:\s*-->)?$');
  final close = RegExp(r'^(?:<!--\s*)?/fleet:v1(?:\s*-->)?$');

  final start = lines.indexWhere((line) => open.hasMatch(line.trim()));
  if (start < 0) return null;

  final fields = <String, String>{};
  final links = <({String kind, String value})>[];
  var inLinks = false;
  for (final raw in lines.skip(start + 1)) {
    final line = raw.trim();
    if (close.hasMatch(line) || line.startsWith('## ')) break;
    if (line.isEmpty) continue;

    final dash = RegExp(r'^[-*]\s+').firstMatch(line);
    final body = dash == null ? line : line.substring(dash.end);
    if (inLinks && dash != null && _bareUrl.hasMatch(body)) {
      links.add((kind: 'link', value: body));
      continue;
    }
    final colon = body.indexOf(':');
    if (colon <= 0) continue;
    final key = normalizeFleetKey(body.substring(0, colon));
    final value = _clean(body.substring(colon + 1));

    if (inLinks && (dash != null || !_topLevelKeys.contains(key))) {
      if (value != null) links.add((kind: key, value: value));
      continue;
    }
    inLinks = key == 'links';
    if (inLinks && value != null && _bareUrl.hasMatch(value)) {
      links.add((kind: 'link', value: value));
    }
    if (value != null && !inLinks) fields[key] = value;
  }
  return FleetBlock(fields: fields, links: links);
}

String? _clean(String raw) {
  var value = raw.trim();
  if (value.length >= 2 &&
      (value.startsWith('"') && value.endsWith('"') ||
          value.startsWith("'") && value.endsWith("'"))) {
    value = value.substring(1, value.length - 1).trim();
  }
  return value.isEmpty ? null : value;
}

/// The description as plain lines: markdown text splits on newlines, and a
/// TipTap/ProseMirror document yields one line per block with its text nodes
/// joined.
List<String> _flattenDescription(String description) {
  final trimmed = description.trimLeft();
  if (trimmed.startsWith('{')) {
    try {
      final decoded = jsonDecode(trimmed);
      final lines = <String>[];
      final buffer = StringBuffer();
      _collectText(decoded, lines, buffer);
      _flush(lines, buffer);
      return lines;
    } on FormatException {
      // Not JSON after all; treat it as text.
    }
  }
  return const LineSplitter().convert(description);
}

void _flush(List<String> lines, StringBuffer buffer) {
  if (buffer.isEmpty) return;
  lines.addAll(const LineSplitter().convert(buffer.toString()));
  buffer.clear();
}

void _collectText(Object? node, List<String> lines, StringBuffer buffer) {
  if (node is! Map) return;
  final type = node['type'];
  if (type == 'text') {
    final text = node['text'];
    if (text is String) buffer.write(text);
    return;
  }
  if (type == 'hardBreak') {
    buffer.write('\n');
    return;
  }
  _flush(lines, buffer);
  if (type == 'heading') {
    final attrs = node['attrs'];
    final level = attrs is Map ? attrs['level'] : null;
    buffer.write('${'#' * (level is int ? level.clamp(1, 6) : 2)} ');
  }
  final content = node['content'];
  if (content is List) {
    for (final child in content) {
      _collectText(child, lines, buffer);
    }
  }
  _flush(lines, buffer);
}

part of 'snapshot_parser.dart';

bool acceptsDecisionItem(Map<String, dynamic> row) {
  try {
    parseNeedsYou(JsonReader(row));
    return true;
  } on SchemaViolation {
    return false;
  }
}

/// Optional history is never allowed to prevent the current snapshot loading.
({List<NeedsYou> items, List<Map<String, dynamic>> rows}) parseResolvedHistory(
  Object? raw,
) {
  final items = <String, NeedsYou>{};
  final rows = <String, Map<String, dynamic>>{};
  if (raw is List) {
    for (final row in raw) {
      if (row is! Map<String, dynamic>) continue;
      final resolved = {...row, 'status': 'resolved'};
      try {
        final item = _withResolution(parseNeedsYou(JsonReader(resolved)), row);
        // The latest occurrence owns both ordering and content.
        items.remove(item.id);
        rows.remove(item.id);
        items[item.id] = item;
        rows[item.id] = resolved;
      } on SchemaViolation {
        continue;
      }
    }
  }
  final skip = items.length > 20 ? items.length - 20 : 0;
  return (
    items: items.values.skip(skip).toList(growable: false),
    rows: rows.values.toList(growable: false),
  );
}

/// The strict item parser drops `resolved_at` and `resolution`; history rows
/// keep them so the Inbox can say when and how an ask was closed. A malformed
/// value is left out rather than rejecting the row.
NeedsYou _withResolution(NeedsYou item, Map<String, dynamic> row) {
  final at = row['resolved_at'];
  final answer = row['resolution'];
  final resolution = answer is String ? answer.trim() : '';
  return NeedsYou(
    id: item.id,
    title: item.title,
    body: item.body,
    askTruncated: item.askTruncated,
    options: item.options,
    recommendedOption: item.recommendedOption,
    state: item.state,
    versionHash: item.versionHash,
    kind: item.kind,
    product: item.product,
    resolvedAt: at is String ? DateTime.tryParse(at)?.toUtc() : null,
    resolution: resolution.isEmpty ? null : resolution,
  );
}

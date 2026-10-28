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
        final item = parseNeedsYou(JsonReader(resolved));
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

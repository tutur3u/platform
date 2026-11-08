/// Optional Forge v1 decision metadata, isolated from the strict legacy schema.
Map<String, dynamic> adaptDecision(Map<String, dynamic> row) {
  final result = Map<String, dynamic>.from(row);
  final status = result.remove('status');
  if (status == 'open') result['state'] = 'open';
  if (status == 'resolved') result['state'] = 'answered';
  // `expired` has no legacy state: keep it for the Inbox card, which closes
  // the ask. Any other status is dropped here, never an error.
  if (status == 'expired') result['status'] = 'expired';
  final text = result.remove('text');
  if (text is String && text.isNotEmpty) result['body'] = text;
  final recommended = result.remove('recommended');
  if (row.containsKey('recommended') &&
      !result.containsKey('recommended_option')) {
    result['recommended_option'] = recommended;
  }
  final ask = result.remove('ask_text');
  if (ask is String && ask.isNotEmpty) result['body'] = ask;
  ['resolved_at', 'resolved_by', 'resolution'].forEach(result.remove);
  return result;
}

/// V1 decision rows share the reply item's stable `item-*` identity.
Map<String, dynamic> adaptDecisionCollections(
  Map<String, dynamic> raw, {
  bool Function(Map<String, dynamic>)? acceptsItem,
}) {
  final root = Map<String, dynamic>.from(raw);
  final decisions = root['decisions'];
  if (decisions is! List) return root;
  final items = <String, Map<String, dynamic>>{};
  final journal = <Object?>[];
  for (final row in decisions) {
    if (row is Map<String, dynamic> && '${row['id']}'.startsWith('item-')) {
      if ((row['status'] == null ||
              const {'open', 'resolved'}.contains(row['status'])) &&
          (acceptsItem == null || acceptsItem(row))) {
        items['${row['id']}'] = adaptDecision(row);
      }
    } else {
      journal.add(row);
    }
  }
  final resolved = root['decisions_resolved'];
  if (resolved is List) {
    for (final row in resolved) {
      if (row is Map<String, dynamic>) {
        items['${row['id']}'] = adaptDecision({...row, 'status': 'resolved'});
      }
    }
  }
  final closed = {
    for (final row in items.values)
      if (row['state'] == 'answered') row['id'],
  };
  final now = root['now'];
  if (now is Map<String, dynamic> && now['needs_you'] is List) {
    final existing = now['needs_you'] as List;
    root['now'] = {
      ...now,
      'needs_you':
          [
                for (final row in existing)
                  if (row is Map<String, dynamic>)
                    items.remove('${row['id']}') ?? adaptDecision(row)
                  else
                    row,
                ...items.values,
              ]
              .where(
                (row) =>
                    row is! Map<String, dynamic> ||
                    (!closed.contains(row['id']) &&
                        row['status'] != 'resolved'),
              )
              .toList(),
    };
  }
  root['decisions'] = journal;
  return root;
}

Map<String, dynamic> adaptThread(
  Map<String, dynamic> row, {
  Set<String> fields = const {'role', 'title', 'state', 'model'},
}) {
  final result = Map<String, dynamic>.from(row);
  final status = result.remove('status');
  result.remove('name');
  if (const {'running', 'waiting', 'idle'}.contains(status)) {
    result['state'] = status;
  }
  return {
    for (final entry in result.entries)
      if (fields.contains(entry.key)) entry.key: entry.value,
  };
}

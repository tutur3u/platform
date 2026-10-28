/// Optional Forge v1 decision metadata, isolated from the strict legacy schema.
Map<String, dynamic> adaptDecision(Map<String, dynamic> row) {
  final result = Map<String, dynamic>.from(row);
  final status = result.remove('status');
  if (status == 'open') result['state'] = 'open';
  if (status == 'resolved') result['state'] = 'answered';
  final ask = result.remove('ask_text');
  if (ask is String && ask.isNotEmpty) result['body'] = ask;
  [
    'resolved_at',
    'resolved_by',
    'resolution',
    'ask_truncated',
  ].forEach(result.remove);
  return result;
}

/// V1 decision rows share the reply item's stable `item-*` identity.
Map<String, dynamic> adaptDecisionCollections(Map<String, dynamic> raw) {
  final root = Map<String, dynamic>.from(raw);
  final decisions = root['decisions'];
  if (decisions is! List) return root;
  final items = <String, Map<String, dynamic>>{};
  final journal = <Object?>[];
  for (final row in decisions) {
    if (row is Map<String, dynamic> && '${row['id']}'.startsWith('item-')) {
      items['${row['id']}'] = adaptDecision(row);
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
                    items.remove('${row['id']}') ?? row
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

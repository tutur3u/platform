/// Mirrors the web reader's folder/search semantics for local bulk feedback.
List<Map<String, dynamic>> optimisticMailItems(
  List<Map<String, dynamic>> items,
  Set<String> ids, {
  required String action,
  required String folder,
  required String query,
}) {
  bool hasFilter(String state) => RegExp(
    '(?:^|\\s)is:(?:"$state"|$state)(?:\\s|\$)',
    caseSensitive: false,
  ).hasMatch(query);

  final remove = switch (action) {
    'snooze' || 'mute' => folder == 'inbox',
    'unsnooze' => folder == 'snoozed',
    'unmute' => folder == 'muted',
    'trash' => folder != 'trash',
    'archive' =>
      hasFilter('unread') || (folder == 'inbox' && !hasFilter('archived')),
    'mark_read' => hasFilter('unread'),
    'mark_unread' => hasFilter('read'),
    'unstar' => folder == 'starred' || hasFilter('starred'),
    'restore' => ['archive', 'trash'].contains(folder),
    _ => false,
  };
  return [
    for (final item in items)
      if (!ids.contains(item['id']))
        item
      else if (!remove)
        if (action == 'mark_read' || action == 'archive')
          {...item, 'unread': false, 'unreadCount': 0}
        else if (action == 'mark_unread')
          {...item, 'unread': true, 'unreadCount': 1}
        else if (action == 'star' || action == 'unstar')
          {...item, 'starred': action == 'star'}
        else
          item,
  ];
}

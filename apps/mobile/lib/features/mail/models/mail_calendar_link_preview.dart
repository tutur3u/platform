class MailCalendarLinkPreview {
  MailCalendarLinkPreview.fromJson(Map<String, dynamic> json)
    : receipt = json['receipt'] as String,
      original = Map<String, dynamic>.from(json['original'] as Map),
      target = Map<String, dynamic>.from(json['target'] as Map),
      invitation = Map<String, dynamic>.from(json['invitation'] as Map);
  final String receipt;
  final Map<String, dynamic> original;
  final Map<String, dynamic> target;
  final Map<String, dynamic> invitation;
  Map<String, dynamic> get selection {
    final identity = target['identity'] as Map;
    return {
      'calendarWorkspaceId': identity['workspaceId'],
      'eventId': identity['eventId'],
      'receipt': receipt,
    };
  }
}

Map<String, dynamic>? parseMailCalendarEventUrl(String value) {
  final uri = Uri.tryParse(value.trim());
  if (uri == null ||
      ![
        'calendar.tuturuuu.com',
        'calendar.tuturuuu.localhost',
      ].contains(uri.host) ||
      uri.userInfo.isNotEmpty ||
      (uri.scheme != 'https' &&
          !(uri.scheme == 'http' && uri.host.endsWith('.localhost')))) {
    return null;
  }
  final parts = uri.pathSegments.where((p) => p.isNotEmpty).toList();
  final id = uri.queryParameters['eventId'];
  final guid = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    caseSensitive: false,
  );
  if (parts.isEmpty ||
      parts.length > 2 ||
      !(guid.hasMatch(parts.last) || parts.last == 'personal') ||
      id == null ||
      !guid.hasMatch(id) ||
      uri.queryParametersAll['eventId']?.length != 1) {
    return null;
  }
  return {'calendarWorkspaceId': parts.last, 'eventId': id};
}

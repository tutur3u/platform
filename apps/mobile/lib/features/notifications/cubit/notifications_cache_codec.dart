part of 'notifications_cubit.dart';

NotificationsState _notificationsStateFromCacheJson(Object? json) {
  if (json is! Map) {
    throw const FormatException('Invalid notifications cache payload.');
  }

  final payload = Map<String, dynamic>.from(json);
  return NotificationsState(
    scopeWorkspaceId: payload['scopeWorkspaceId'] as String?,
    unreadCount: payload['unreadCount'] as int? ?? 0,
    all: _feedFromCacheJson(payload['all']),
    inbox: _feedFromCacheJson(payload['inbox']),
    archive: _feedFromCacheJson(payload['archive']),
  );
}

Map<String, dynamic> _notificationsStateToCacheJson(NotificationsState state) =>
    {
      'scopeWorkspaceId': state.scopeWorkspaceId,
      'unreadCount': state.unreadCount,
      'all': _feedToCacheJson(state.all),
      'inbox': _feedToCacheJson(state.inbox),
      'archive': _feedToCacheJson(state.archive),
    };

NotificationFeedState _feedFromCacheJson(Object? json) {
  if (json is! Map) {
    return const NotificationFeedState();
  }

  final payload = Map<String, dynamic>.from(json);
  final statusName = payload['status'] as String?;
  final itemsRaw = payload['items'] as List<dynamic>? ?? const [];
  return NotificationFeedState(
    status: statusName == null
        ? NotificationFeedStatus.initial
        : NotificationFeedStatus.values.byName(statusName),
    items: itemsRaw
        .whereType<Map<Object?, Object?>>()
        .map(
          (item) => AppNotification.fromJson(Map<String, dynamic>.from(item)),
        )
        .toList(growable: false),
    totalCount: payload['totalCount'] as int? ?? 0,
    pageSize: payload['pageSize'] as int? ?? 20,
  );
}

Map<String, dynamic> _feedToCacheJson(NotificationFeedState state) => {
  'status': state.hasLoadedOnce
      ? NotificationFeedStatus.loaded.name
      : NotificationFeedStatus.initial.name,
  'items': state.items.map((item) => item.toJson()).toList(growable: false),
  'totalCount': state.totalCount,
  'pageSize': state.pageSize,
};

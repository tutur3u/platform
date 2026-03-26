part of 'notifications_cubit.dart';

const _notificationsStateSentinel = Object();

enum NotificationsTab { inbox, archive }

enum NotificationFeedStatus { initial, loading, loaded, error }

class NotificationFeedState extends Equatable {
  const NotificationFeedState({
    this.status = NotificationFeedStatus.initial,
    this.items = const [],
    this.totalCount = 0,
    this.pageSize = 20,
    this.isLoadingMore = false,
    this.error,
  });

  final NotificationFeedStatus status;
  final List<AppNotification> items;
  final int totalCount;
  final int pageSize;
  final bool isLoadingMore;
  final String? error;

  bool get hasLoadedOnce =>
      status == NotificationFeedStatus.loaded || items.isNotEmpty;

  bool get hasMore => items.length < totalCount;

  NotificationFeedState copyWith({
    NotificationFeedStatus? status,
    List<AppNotification>? items,
    int? totalCount,
    int? pageSize,
    bool? isLoadingMore,
    Object? error = _notificationsStateSentinel,
    bool clearError = false,
  }) {
    return NotificationFeedState(
      status: status ?? this.status,
      items: items ?? this.items,
      totalCount: totalCount ?? this.totalCount,
      pageSize: pageSize ?? this.pageSize,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError
          ? null
          : error == _notificationsStateSentinel
          ? this.error
          : error as String?,
    );
  }

  @override
  List<Object?> get props => [
    status,
    items,
    totalCount,
    pageSize,
    isLoadingMore,
    error,
  ];
}

class NotificationsState extends Equatable {
  const NotificationsState({
    this.scopeWorkspaceId,
    this.unreadCount = 0,
    this.isUnreadCountLoading = false,
    this.pendingIds = const [],
    this.isArchivingAll = false,
    this.inbox = const NotificationFeedState(),
    this.archive = const NotificationFeedState(),
  });

  final String? scopeWorkspaceId;
  final int unreadCount;
  final bool isUnreadCountLoading;
  final List<String> pendingIds;
  final bool isArchivingAll;
  final NotificationFeedState inbox;
  final NotificationFeedState archive;

  NotificationFeedState feedFor(NotificationsTab tab) {
    return tab == NotificationsTab.inbox ? inbox : archive;
  }

  bool isPending(String notificationId) => pendingIds.contains(notificationId);

  NotificationsState copyWith({
    Object? scopeWorkspaceId = _notificationsStateSentinel,
    int? unreadCount,
    bool? isUnreadCountLoading,
    List<String>? pendingIds,
    bool? isArchivingAll,
    NotificationFeedState? feed,
    NotificationsTab? targetTab,
    NotificationFeedState? inbox,
    NotificationFeedState? archive,
  }) {
    final nextInbox = targetTab == NotificationsTab.inbox
        ? (feed ?? this.inbox)
        : (inbox ?? this.inbox);
    final nextArchive = targetTab == NotificationsTab.archive
        ? (feed ?? this.archive)
        : (archive ?? this.archive);

    return NotificationsState(
      scopeWorkspaceId: scopeWorkspaceId == _notificationsStateSentinel
          ? this.scopeWorkspaceId
          : scopeWorkspaceId as String?,
      unreadCount: unreadCount ?? this.unreadCount,
      isUnreadCountLoading: isUnreadCountLoading ?? this.isUnreadCountLoading,
      pendingIds: pendingIds ?? this.pendingIds,
      isArchivingAll: isArchivingAll ?? this.isArchivingAll,
      inbox: nextInbox,
      archive: nextArchive,
    );
  }

  @override
  List<Object?> get props => [
    scopeWorkspaceId,
    unreadCount,
    isUnreadCountLoading,
    pendingIds,
    isArchivingAll,
    inbox,
    archive,
  ];
}

List<String> _sortedPendingIds(Set<String> pendingIds) {
  final sorted = pendingIds.toList(growable: false)..sort();
  return sorted;
}

List<AppNotification> _dedupeNotifications(
  List<AppNotification> notifications,
) {
  final seen = <String>{};
  return [
    for (final notification in notifications)
      if (seen.add(notification.id)) notification,
  ];
}

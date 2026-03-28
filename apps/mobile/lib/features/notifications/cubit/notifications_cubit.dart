import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';

part 'notifications_state.dart';

class NotificationsCubit extends Cubit<NotificationsState> {
  NotificationsCubit({
    required NotificationsRepository notificationsRepository,
    NotificationsState? initialState,
  }) : _notificationsRepository = notificationsRepository,
       super(initialState ?? const NotificationsState());

  final NotificationsRepository _notificationsRepository;
  static const CachePolicy _cachePolicy = CachePolicies.summary;
  static const _cacheTag = 'notifications:feed';

  bool _scopeInitialized = false;

  static CacheKey _cacheKey({String? wsId}) {
    return CacheKey(
      namespace: 'notifications.feed',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
    );
  }

  static NotificationsState? seedStateForWorkspace(String? wsId) {
    final cached = CacheStore.instance.peek<NotificationsState>(
      key: _cacheKey(wsId: wsId),
      decode: _stateFromCacheJson,
    );
    final state = cached.data;
    if (!cached.hasValue || state == null) {
      return null;
    }
    return state;
  }

  Future<void> setWorkspace(Workspace? workspace) async {
    final nextScopeWorkspaceId = _resolveScopeWorkspaceId(workspace);
    if (_scopeInitialized && state.scopeWorkspaceId == nextScopeWorkspaceId) {
      return;
    }

    _scopeInitialized = true;
    final isSeededState =
        state.scopeWorkspaceId == nextScopeWorkspaceId &&
        (state.inbox.hasLoadedOnce ||
            state.archive.hasLoadedOnce ||
            state.unreadCount > 0);
    if (isSeededState) {
      emit(
        state.copyWith(
          pendingIds: const [],
          isArchivingAll: false,
          isUnreadCountLoading: false,
        ),
      );
      await refreshUnreadCount();
      return;
    }

    emit(
      state.copyWith(
        scopeWorkspaceId: nextScopeWorkspaceId,
        unreadCount: 0,
        pendingIds: const [],
        isArchivingAll: false,
        isUnreadCountLoading: false,
        inbox: const NotificationFeedState(),
        archive: const NotificationFeedState(),
      ),
    );

    await refreshUnreadCount();
  }

  Future<void> refreshUnreadCount() async {
    emit(state.copyWith(isUnreadCountLoading: true));
    try {
      final unreadCount = await _notificationsRepository.fetchUnreadCount(
        wsId: state.scopeWorkspaceId,
      );
      emit(
        state.copyWith(
          unreadCount: unreadCount,
          isUnreadCountLoading: false,
        ),
      );
      await _persistCurrentState();
    } on Exception {
      emit(state.copyWith(isUnreadCountLoading: false));
    }
  }

  Future<void> loadTab(
    NotificationsTab tab, {
    bool refresh = false,
  }) async {
    final feed = state.feedFor(tab);
    if (!refresh && feed.hasLoadedOnce) {
      return;
    }
    if (feed.status == NotificationFeedStatus.loading) {
      return;
    }

    emit(
      state.copyWith(
        feed: state
            .feedFor(tab)
            .copyWith(
              status: NotificationFeedStatus.loading,
              clearError: true,
            ),
        targetTab: tab,
      ),
    );

    try {
      final page = await _notificationsRepository.fetchNotifications(
        wsId: state.scopeWorkspaceId,
        unreadOnly: tab == NotificationsTab.inbox,
        readOnly: tab == NotificationsTab.archive,
        limit: feed.pageSize,
      );
      emit(
        state.copyWith(
          feed: NotificationFeedState(
            status: NotificationFeedStatus.loaded,
            items: page.notifications,
            totalCount: page.count,
            pageSize: page.limit,
          ),
          targetTab: tab,
        ),
      );
      await _persistCurrentState();
    } on Exception catch (error) {
      emit(
        state.copyWith(
          feed: state
              .feedFor(tab)
              .copyWith(
                status: NotificationFeedStatus.error,
                error: error.toString(),
              ),
          targetTab: tab,
        ),
      );
    }
  }

  Future<void> loadMore(NotificationsTab tab) async {
    final feed = state.feedFor(tab);
    if (!feed.hasLoadedOnce ||
        !feed.hasMore ||
        feed.isLoadingMore ||
        feed.status == NotificationFeedStatus.loading) {
      return;
    }

    emit(
      state.copyWith(
        feed: feed.copyWith(isLoadingMore: true, clearError: true),
        targetTab: tab,
      ),
    );

    try {
      final page = await _notificationsRepository.fetchNotifications(
        wsId: state.scopeWorkspaceId,
        unreadOnly: tab == NotificationsTab.inbox,
        readOnly: tab == NotificationsTab.archive,
        limit: feed.pageSize,
        offset: feed.items.length,
      );
      final merged = _dedupeNotifications([
        ...feed.items,
        ...page.notifications,
      ]);
      emit(
        state.copyWith(
          feed: feed.copyWith(
            status: NotificationFeedStatus.loaded,
            items: merged,
            totalCount: page.count,
            pageSize: page.limit,
            isLoadingMore: false,
            clearError: true,
          ),
          targetTab: tab,
        ),
      );
      await _persistCurrentState();
    } on Exception catch (error) {
      emit(
        state.copyWith(
          feed: feed.copyWith(
            status: NotificationFeedStatus.error,
            isLoadingMore: false,
            error: error.toString(),
          ),
          targetTab: tab,
        ),
      );
    }
  }

  Future<void> toggleRead(AppNotification notification) async {
    await _runPending(notification.id, () async {
      await _notificationsRepository.markRead(
        id: notification.id,
        read: notification.isUnread,
      );
      await _refreshLoadedTabs(
        preferredTab: notification.isUnread
            ? NotificationsTab.inbox
            : NotificationsTab.archive,
      );
    });
  }

  Future<void> markAllRead() async {
    if (state.isArchivingAll) {
      return;
    }

    emit(state.copyWith(isArchivingAll: true));
    try {
      await _notificationsRepository.markAllRead(wsId: state.scopeWorkspaceId);
      await _refreshLoadedTabs(preferredTab: NotificationsTab.inbox);
    } finally {
      emit(state.copyWith(isArchivingAll: false));
    }
  }

  Future<String?> acceptInvite(AppNotification notification) async {
    return _runPending(notification.id, () async {
      final workspaceId = notification.workspaceId;
      if (workspaceId == null) {
        throw const FormatException('Missing workspace id');
      }

      await _notificationsRepository.acceptWorkspaceInvite(workspaceId);
      await _notificationsRepository.updateMetadata(
        id: notification.id,
        metadata: {
          'action_taken': 'accepted',
          'action_timestamp': DateTime.now().toUtc().toIso8601String(),
        },
      );
      await _refreshLoadedTabs(preferredTab: NotificationsTab.inbox);
      return workspaceId;
    });
  }

  Future<String?> declineInvite(AppNotification notification) async {
    return _runPending(notification.id, () async {
      final workspaceId = notification.workspaceId;
      if (workspaceId == null) {
        throw const FormatException('Missing workspace id');
      }

      await _notificationsRepository.declineWorkspaceInvite(workspaceId);
      await _notificationsRepository.updateMetadata(
        id: notification.id,
        metadata: {
          'action_taken': 'declined',
          'action_timestamp': DateTime.now().toUtc().toIso8601String(),
        },
      );
      await _refreshLoadedTabs(preferredTab: NotificationsTab.inbox);
      return workspaceId;
    });
  }

  Future<T> _runPending<T>(
    String notificationId,
    Future<T> Function() action,
  ) async {
    emit(
      state.copyWith(
        pendingIds: _sortedPendingIds({
          ...state.pendingIds,
          notificationId,
        }),
      ),
    );

    try {
      return await action();
    } finally {
      final remaining = [...state.pendingIds]..remove(notificationId);
      emit(state.copyWith(pendingIds: _sortedPendingIds(remaining.toSet())));
    }
  }

  Future<void> _refreshLoadedTabs({
    NotificationsTab? preferredTab,
  }) async {
    await refreshUnreadCount();

    final inboxLoaded = state.inbox.hasLoadedOnce;
    final archiveLoaded = state.archive.hasLoadedOnce;

    if (inboxLoaded) {
      await loadTab(NotificationsTab.inbox, refresh: true);
    }
    if (archiveLoaded) {
      await loadTab(NotificationsTab.archive, refresh: true);
    }
    if (!inboxLoaded && !archiveLoaded && preferredTab != null) {
      await loadTab(preferredTab, refresh: true);
    }
  }

  Future<void> _persistCurrentState() async {
    await CacheStore.instance.write(
      key: _cacheKey(wsId: state.scopeWorkspaceId),
      policy: _cachePolicy,
      payload: _stateToCacheJson(state),
      tags: [
        _cacheTag,
        if (state.scopeWorkspaceId != null)
          'workspace:${state.scopeWorkspaceId}',
        'module:notifications',
      ],
    );
  }

  static NotificationsState _stateFromCacheJson(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid notifications cache payload.');
    }

    final payload = Map<String, dynamic>.from(json);
    return NotificationsState(
      scopeWorkspaceId: payload['scopeWorkspaceId'] as String?,
      unreadCount: payload['unreadCount'] as int? ?? 0,
      inbox: _feedFromCacheJson(payload['inbox']),
      archive: _feedFromCacheJson(payload['archive']),
    );
  }

  static Map<String, dynamic> _stateToCacheJson(NotificationsState state) => {
    'scopeWorkspaceId': state.scopeWorkspaceId,
    'unreadCount': state.unreadCount,
    'inbox': _feedToCacheJson(state.inbox),
    'archive': _feedToCacheJson(state.archive),
  };

  static NotificationFeedState _feedFromCacheJson(Object? json) {
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

  static Map<String, dynamic> _feedToCacheJson(NotificationFeedState state) => {
    'status': state.status.name,
    'items': state.items.map((item) => item.toJson()).toList(growable: false),
    'totalCount': state.totalCount,
    'pageSize': state.pageSize,
  };

  String? _resolveScopeWorkspaceId(Workspace? workspace) {
    if (workspace == null || workspace.personal) {
      return null;
    }
    return workspace.id;
  }
}

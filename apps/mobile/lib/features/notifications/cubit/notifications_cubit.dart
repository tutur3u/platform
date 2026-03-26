import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';

part 'notifications_state.dart';

class NotificationsCubit extends Cubit<NotificationsState> {
  NotificationsCubit({
    required NotificationsRepository notificationsRepository,
  }) : _notificationsRepository = notificationsRepository,
       super(const NotificationsState());

  final NotificationsRepository _notificationsRepository;

  bool _scopeInitialized = false;

  Future<void> setWorkspace(Workspace? workspace) async {
    final nextScopeWorkspaceId = _resolveScopeWorkspaceId(workspace);
    if (_scopeInitialized && state.scopeWorkspaceId == nextScopeWorkspaceId) {
      return;
    }

    _scopeInitialized = true;
    emit(
      state.copyWith(
        scopeWorkspaceId: nextScopeWorkspaceId,
        unreadCount: 0,
        pendingIds: const [],
        isArchivingAll: false,
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

  String? _resolveScopeWorkspaceId(Workspace? workspace) {
    if (workspace == null || workspace.personal) {
      return null;
    }
    return workspace.id;
  }
}

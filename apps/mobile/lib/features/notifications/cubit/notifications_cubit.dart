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

import 'package:mobile/features/notifications/data/notification_read_cleanup.dart';
import 'package:mobile/features/notifications/push/delivered_inbox_notifications.dart';

part 'notifications_state.dart';

class NotificationsCubit extends Cubit<NotificationsState> {
  NotificationsCubit({
    required NotificationsRepository notificationsRepository,
    NotificationsState? initialState,
    String? Function()? currentUserId,
  }) : _notificationsRepository = notificationsRepository,
       _currentUserId = currentUserId ?? currentCacheUserId,
       _scopeUserId = (currentUserId ?? currentCacheUserId)(),
       super(initialState ?? const NotificationsState());

  final NotificationsRepository _notificationsRepository;
  final String? Function() _currentUserId;
  String? _scopeUserId;
  static const CachePolicy _cachePolicy = CachePolicies.summary;
  static const _cacheTag = 'notifications:feed';

  bool _scopeInitialized = false;
  int _scopeEpoch = 0;
  Future<bool>? _unreadRefresh;

  bool _isCurrentScope(int epoch, String? userId) =>
      !isClosed && epoch == _scopeEpoch && userId == _currentUserId();

  void _syncActorScope() {
    final userId = _currentUserId();
    if (_scopeUserId == userId) return;
    _scopeUserId = userId;
    _scopeInitialized = false;
    _scopeEpoch++;
    _unreadRefresh = null;
    emit(NotificationsState(scopeWorkspaceId: state.scopeWorkspaceId));
  }

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
    if (isClosed) {
      return;
    }

    _syncActorScope();
    final nextScopeWorkspaceId = _resolveScopeWorkspaceId(workspace);
    if (_scopeInitialized && state.scopeWorkspaceId == nextScopeWorkspaceId) {
      return;
    }

    _scopeInitialized = true;
    _scopeEpoch++;
    _unreadRefresh = null;
    final isSeededState =
        state.scopeWorkspaceId == nextScopeWorkspaceId &&
        (state.inbox.hasLoadedOnce ||
            state.archive.hasLoadedOnce ||
            state.unreadCount > 0);
    if (isSeededState) {
      if (isClosed) {
        return;
      }
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

    if (isClosed) {
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

  Future<void> refreshUnreadCount() => _refreshUnreadCountResult();

  Future<bool> _refreshUnreadCountResult() {
    if (isClosed) return Future<bool>.value(false);
    _syncActorScope();
    final running = _unreadRefresh;
    if (running != null) return running;

    final completion = Completer<bool>();
    _unreadRefresh = completion.future;
    unawaited(_fetchUnreadCount(completion));
    return completion.future;
  }

  Future<void> _fetchUnreadCount(Completer<bool> completion) async {
    final epoch = _scopeEpoch;
    final userId = _currentUserId();
    final workspaceId = state.scopeWorkspaceId;
    var succeeded = false;
    emit(state.copyWith(isUnreadCountLoading: true));
    try {
      final unreadCount = await _notificationsRepository.fetchUnreadCount(
        wsId: workspaceId,
      );
      if (!_isCurrentScope(epoch, userId)) return;
      final changed = state.unreadCount != unreadCount;
      emit(
        state.copyWith(unreadCount: unreadCount, isUnreadCountLoading: false),
      );
      // A badge refresh must not serialize the entire feed when unchanged.
      if (changed) await _persistCurrentState();
      succeeded = _isCurrentScope(epoch, userId);
    } on Exception {
      if (_isCurrentScope(epoch, userId)) {
        emit(state.copyWith(isUnreadCountLoading: false));
      }
    } finally {
      if (identical(_unreadRefresh, completion.future)) _unreadRefresh = null;
      completion.complete(succeeded);
    }
  }

  Future<void> loadTab(NotificationsTab tab, {bool refresh = false}) async {
    await _loadTabResult(tab, refresh: refresh);
  }

  Future<bool> _loadTabResult(
    NotificationsTab tab, {
    bool refresh = false,
  }) async {
    if (isClosed) {
      return false;
    }

    final epoch = _scopeEpoch;
    final userId = _currentUserId();
    final workspaceId = state.scopeWorkspaceId;
    final feed = state.feedFor(tab);
    if (!refresh && feed.hasLoadedOnce) {
      return true;
    }
    if (feed.status == NotificationFeedStatus.loading) {
      return false;
    }

    emit(
      state.copyWith(
        feed: state
            .feedFor(tab)
            .copyWith(status: NotificationFeedStatus.loading, clearError: true),
        targetTab: tab,
      ),
    );

    try {
      final page = await _notificationsRepository.fetchNotifications(
        wsId: workspaceId,
        unreadOnly: tab == NotificationsTab.inbox,
        readOnly: tab == NotificationsTab.archive,
        limit: feed.pageSize,
      );
      if (!_isCurrentScope(epoch, userId)) {
        return false;
      }
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
      return _isCurrentScope(epoch, userId);
    } on Exception catch (error) {
      if (!_isCurrentScope(epoch, userId)) {
        return false;
      }
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
    return false;
  }

  Future<void> loadMore(NotificationsTab tab) async {
    if (isClosed) {
      return;
    }

    final epoch = _scopeEpoch;
    final userId = _currentUserId();
    final workspaceId = state.scopeWorkspaceId;
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
        wsId: workspaceId,
        unreadOnly: tab == NotificationsTab.inbox,
        readOnly: tab == NotificationsTab.archive,
        limit: feed.pageSize,
        offset: feed.items.length,
      );
      if (!_isCurrentScope(epoch, userId)) {
        return;
      }
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
      if (!_isCurrentScope(epoch, userId)) {
        return;
      }
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

  /// Capture before awaiting a read, including native session ABA.
  bool Function() captureReadFeedbackGuard() {
    if (!isClosed) _syncActorScope();
    final epoch = _scopeEpoch;
    final actor = _currentUserId();
    final bridge = DeliveredInboxNotifications.instance;
    final session = actor == null ? null : bridge.captureSession(actor);
    return () =>
        _isCurrentScope(epoch, actor) &&
        session != null &&
        bridge.isCurrentSession(session);
  }

  Future<NotificationReadResult> toggleRead(
    AppNotification notification,
  ) async {
    if (isClosed) return NotificationReadResult.notAdmitted;
    _syncActorScope();
    final epoch = _scopeEpoch;
    final actor = _scopeUserId;
    final workspaceId = state.scopeWorkspaceId;
    final feedbackCurrent = captureReadFeedbackGuard();
    bool current() => _isCurrentScope(epoch, actor) && feedbackCurrent();
    if (!current() || state.isPending(notification.id)) {
      return NotificationReadResult.notAdmitted;
    }
    emit(
      state.copyWith(
        pendingIds: _sortedPendingIds({...state.pendingIds, notification.id}),
      ),
    );
    try {
      final result = await readWithDeliveredCleanup(
        actor: actor,
        workspaceId: workspaceId,
        notificationId: notification.id,
        dismiss: notification.isUnread,
        isCurrent: current,
        read: () => _notificationsRepository.markRead(
          id: notification.id,
          read: notification.isUnread,
        ),
      );
      if (result == NotificationReadResult.notAdmitted) return result;
      if (!current()) return NotificationReadResult.acceptedScopeChanged;
      if (result == NotificationReadResult.notAdmitted ||
          result == NotificationReadResult.acceptedScopeChanged) {
        return result;
      }
      try {
        final refreshed = await _refreshLoadedTabs(
          preferredTab: notification.isUnread
              ? NotificationsTab.inbox
              : NotificationsTab.archive,
          isCurrent: current,
        );
        if (!refreshed) {
          return _failedReadRefreshResult(result, current());
        }
      } on Object {
        return _failedReadRefreshResult(result, current());
      }
      return current() ? result : NotificationReadResult.acceptedScopeChanged;
    } finally {
      if (_isCurrentScope(epoch, actor)) {
        final pending = [...state.pendingIds]..remove(notification.id);
        emit(state.copyWith(pendingIds: _sortedPendingIds(pending.toSet())));
      }
    }
  }

  NotificationReadResult _failedReadRefreshResult(
    NotificationReadResult cleanupResult,
    bool current,
  ) {
    if (!current) return NotificationReadResult.acceptedScopeChanged;
    // The tray cleanup warning remains actionable even if the feed also fails.
    return cleanupResult == NotificationReadResult.acceptedCleanupUnavailable
        ? cleanupResult
        : NotificationReadResult.acceptedRefreshUnavailable;
  }

  Future<NotificationReadResult> markAllRead() async {
    if (isClosed) return NotificationReadResult.notAdmitted;
    _syncActorScope();
    if (isClosed || state.isArchivingAll) {
      return NotificationReadResult.notAdmitted;
    }
    final epoch = _scopeEpoch;
    final actor = _scopeUserId;
    final workspaceId = state.scopeWorkspaceId;
    final feedbackCurrent = captureReadFeedbackGuard();
    bool current() => _isCurrentScope(epoch, actor) && feedbackCurrent();
    emit(state.copyWith(isArchivingAll: true));
    try {
      final result = await readWithDeliveredCleanup(
        actor: actor,
        workspaceId: workspaceId,
        isCurrent: current,
        read: () => _notificationsRepository.markAllRead(wsId: workspaceId),
      );
      if (result == NotificationReadResult.notAdmitted) return result;
      if (!current()) return NotificationReadResult.acceptedScopeChanged;
      if (result == NotificationReadResult.notAdmitted ||
          result == NotificationReadResult.acceptedScopeChanged) {
        return result;
      }
      try {
        final refreshed = await _refreshLoadedTabs(
          preferredTab: NotificationsTab.inbox,
          isCurrent: current,
        );
        if (!refreshed) {
          return _failedReadRefreshResult(result, current());
        }
      } on Object {
        return _failedReadRefreshResult(result, current());
      }
      return current() ? result : NotificationReadResult.acceptedScopeChanged;
    } finally {
      if (_isCurrentScope(epoch, actor)) {
        emit(state.copyWith(isArchivingAll: false));
      }
    }
  }

  Future<String?> acceptInvite(AppNotification notification) async {
    return await _runPending(notification.id, () async {
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
    return await _runPending(notification.id, () async {
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
    if (isClosed) {
      throw StateError('Notifications cubit is closed');
    }

    emit(
      state.copyWith(
        pendingIds: _sortedPendingIds({...state.pendingIds, notificationId}),
      ),
    );

    try {
      return await action();
    } finally {
      if (!isClosed) {
        final remaining = [...state.pendingIds]..remove(notificationId);
        emit(state.copyWith(pendingIds: _sortedPendingIds(remaining.toSet())));
      }
    }
  }

  Future<bool> _refreshLoadedTabs({
    NotificationsTab? preferredTab,
    bool Function()? isCurrent,
  }) async {
    // A completed mutation needs a count requested after the write.
    await _unreadRefresh;
    if (isCurrent?.call() == false) return false;
    var succeeded = await _refreshUnreadCountResult();
    if (isClosed || isCurrent?.call() == false) return false;

    final inboxLoaded = state.inbox.hasLoadedOnce;
    final archiveLoaded = state.archive.hasLoadedOnce;

    if (inboxLoaded) {
      succeeded =
          await _loadTabResult(NotificationsTab.inbox, refresh: true) &&
          succeeded;
    }
    if (isCurrent?.call() == false) return false;
    if (archiveLoaded) {
      succeeded =
          await _loadTabResult(NotificationsTab.archive, refresh: true) &&
          succeeded;
    }
    if (!inboxLoaded && !archiveLoaded && preferredTab != null) {
      succeeded =
          await _loadTabResult(preferredTab, refresh: true) && succeeded;
    }
    return succeeded;
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

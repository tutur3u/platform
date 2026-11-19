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
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/notifications/data/notification_read_cleanup.dart';
import 'package:mobile/features/notifications/data/notifications_unread_count.dart';
import 'package:mobile/features/notifications/push/delivered_inbox_notifications.dart';

part 'notifications_cache_codec.dart';
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
  final _tabRefreshes = <NotificationsTab, Future<bool>>{};
  final _tabGenerations = <NotificationsTab, int>{};

  @override
  void onChange(Change<NotificationsState> change) {
    super.onChange(change);
    if (change.currentState.unreadCount != change.nextState.unreadCount) {
      NotificationsUnreadCount.instance.publish(change.nextState.unreadCount);
    }
  }

  bool _isCurrentScope(int epoch, String? userId) =>
      !isClosed && epoch == _scopeEpoch && userId == _currentUserId();

  void _syncActorScope() {
    final userId = _currentUserId();
    if (_scopeUserId == userId) return;
    _scopeUserId = userId;
    _scopeInitialized = false;
    _scopeEpoch++;
    _unreadRefresh = null;
    _tabRefreshes.clear();
    _tabGenerations.clear();
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
      decode: _notificationsStateFromCacheJson,
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
    _tabRefreshes.clear();
    _tabGenerations.clear();
    final isSeededState =
        state.scopeWorkspaceId == nextScopeWorkspaceId &&
        (state.all.hasLoadedOnce ||
            state.inbox.hasLoadedOnce ||
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
        all: const NotificationFeedState(),
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

  Future<bool> _loadTabResult(NotificationsTab tab, {bool refresh = false}) {
    if (isClosed) return Future.value(false);
    _syncActorScope();
    if (!refresh && state.feedFor(tab).hasLoadedOnce) return Future.value(true);
    final existing = _tabRefreshes[tab];
    if (existing != null) return existing;
    late final Future<bool> running;
    running = _fetchTabResult(tab).whenComplete(() {
      if (identical(_tabRefreshes[tab], running)) {
        _tabRefreshes.removeWhere((key, _) => key == tab);
      }
    });
    _tabRefreshes[tab] = running;
    return running;
  }

  Future<bool> _fetchTabResult(NotificationsTab tab) async {
    final epoch = _scopeEpoch;
    final userId = _currentUserId();
    final workspaceId = state.scopeWorkspaceId;
    final generation = _tabGenerations[tab] ?? 0;
    bool current() =>
        _isCurrentScope(epoch, userId) &&
        generation == (_tabGenerations[tab] ?? 0);
    final feed = state.feedFor(tab);

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
      if (!current()) {
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
      return current();
    } on Exception catch (error) {
      if (!current()) {
        return false;
      }
      emit(
        state.copyWith(
          feed: state
              .feedFor(tab)
              .copyWith(
                status: NotificationFeedStatus.error,
                isOffline: _isOfflineError(error),
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
    final generation = _tabGenerations[tab] ?? 0;
    bool current() =>
        _isCurrentScope(epoch, userId) &&
        generation == (_tabGenerations[tab] ?? 0);
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
      if (!current()) {
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
      if (!current()) {
        return;
      }
      emit(
        state.copyWith(
          feed: feed.copyWith(
            status: NotificationFeedStatus.error,
            isLoadingMore: false,
            isOffline: _isOfflineError(error),
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
    final beforeRead = state;
    applyLocalRead(notification.id, read: notification.isUnread);
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
      if (result == NotificationReadResult.notAdmitted) {
        _revertLocalRead(beforeRead, notification, current);
        return result;
      }
      if (!current()) return NotificationReadResult.acceptedScopeChanged;
      if (result == NotificationReadResult.acceptedScopeChanged) {
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
    } on Object {
      _revertLocalRead(beforeRead, notification, current);
      rethrow;
    } finally {
      if (_isCurrentScope(epoch, actor)) {
        final pending = [...state.pendingIds]..remove(notification.id);
        emit(state.copyWith(pendingIds: _sortedPendingIds(pending.toSet())));
      }
    }
  }

  /// Shows [read] on every loaded copy of [notificationId] and adjusts the
  /// unread count before the server confirms, so rows and badges respond on
  /// tap. A later feed refresh replaces the patched rows.
  void applyLocalRead(String notificationId, {required bool read}) {
    if (isClosed) return;
    NotificationFeedState patch(NotificationFeedState feed) {
      final index = feed.items.indexWhere(
        (item) => item.id == notificationId && item.isUnread == read,
      );
      if (index < 0) return feed;
      final items = [...feed.items];
      items[index] = items[index].copyWith(
        readAt: read ? DateTime.now() : null,
      );
      return feed.copyWith(items: items);
    }

    final source = [
      ...state.all.items,
      ...state.inbox.items,
      ...state.archive.items,
    ].where((item) => item.id == notificationId).firstOrNull;
    final delta = source == null || source.isUnread != read
        ? 0
        : (read ? -1 : 1);
    emit(
      state.copyWith(
        all: patch(state.all),
        inbox: patch(state.inbox),
        archive: patch(state.archive),
        unreadCount: (state.unreadCount + delta).clamp(0, 1 << 30),
      ),
    );
  }

  void _revertLocalRead(
    NotificationsState before,
    AppNotification notification,
    bool Function() current,
  ) {
    if (isClosed || !current()) return;
    applyLocalRead(notification.id, read: !notification.isUnread);
    if (state.unreadCount != before.unreadCount) {
      emit(state.copyWith(unreadCount: before.unreadCount));
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
    final epoch = _scopeEpoch;
    final actor = _currentUserId();
    bool current() =>
        _isCurrentScope(epoch, actor) && isCurrent?.call() != false;
    if (!current()) return false;
    // Invalidate pre-write publication before awaiting either count or feed.
    final previousTabs = Map<NotificationsTab, Future<bool>>.of(_tabRefreshes);
    for (final tab in NotificationsTab.values) {
      _tabGenerations[tab] = (_tabGenerations[tab] ?? 0) + 1;
    }
    for (final previous in previousTabs.values) {
      try {
        await previous;
      } on Object {
        // The receipt is the fresh post-write request, not the old flight.
      }
      if (!current()) return false;
    }
    // A completed mutation needs a count requested after the write.
    await _unreadRefresh;
    if (!current()) return false;
    var succeeded = await _refreshUnreadCountResult();
    if (!current()) return false;

    final loadedTabs = [
      for (final tab in NotificationsTab.values)
        if (state.feedFor(tab).hasLoadedOnce) tab,
    ];
    for (final tab in loadedTabs) {
      succeeded = await _loadTabResult(tab, refresh: true) && succeeded;
      if (!current()) return false;
    }
    if (loadedTabs.isEmpty && preferredTab != null) {
      succeeded =
          await _loadTabResult(preferredTab, refresh: true) && succeeded;
    }
    return succeeded;
  }

  Future<void> _persistCurrentState() async {
    await CacheStore.instance.write(
      key: _cacheKey(wsId: state.scopeWorkspaceId),
      policy: _cachePolicy,
      payload: _notificationsStateToCacheJson(state),
      tags: [
        _cacheTag,
        if (state.scopeWorkspaceId != null)
          'workspace:${state.scopeWorkspaceId}',
        'module:notifications',
      ],
    );
  }

  String? _resolveScopeWorkspaceId(Workspace? workspace) {
    if (workspace == null || workspace.personal) {
      return null;
    }
    return workspace.id;
  }

  static bool _isOfflineError(Object error) =>
      error is ApiException && error.failureKind == ApiFailureKind.transport;
}

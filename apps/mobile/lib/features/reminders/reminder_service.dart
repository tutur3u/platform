import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/reminders/reminder_notification_copy.dart';
import 'package:mobile/features/reminders/reminder_plan.dart';
import 'package:mobile/features/reminders/reminder_settings.dart';
import 'package:mobile/features/reminders/reminder_timezone_resolver.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ReminderService extends ChangeNotifier {
  ReminderService({
    ReminderTimezoneResolver? timezoneResolver,
    TaskRepository? taskRepository,
    CalendarRepository? calendarRepository,
    PushNotificationService? notifications,
    SettingsRepository? settingsRepository,
    DateTime Function()? now,
  }) : _timezoneResolver = timezoneResolver ?? ReminderTimezoneResolver(),
       _taskRepository = taskRepository ?? TaskRepository(),
       _calendarRepository = calendarRepository ?? CalendarRepository(),
       _notifications = notifications ?? PushNotificationService.instance,
       _settingsRepository = settingsRepository ?? SettingsRepository(),
       _now = now ?? DateTime.now;

  static final ReminderService instance = ReminderService();
  final ReminderTimezoneResolver _timezoneResolver;
  int _scopeGeneration = 0;

  bool _isCurrent(String userId, int generation) =>
      _userId == userId && _scopeGeneration == generation;

  final TaskRepository _taskRepository;
  final CalendarRepository _calendarRepository;
  final PushNotificationService _notifications;
  final SettingsRepository _settingsRepository;
  final DateTime Function() _now;
  String? _userId;
  List<Workspace> _workspaces = const [];
  bool _workspacesResolved = false;
  Future<void>? _initializing;
  Future<void>? _refreshing;
  ReminderSettings settings = const ReminderSettings();
  ReminderStatus status = const ReminderStatus();

  String? get userId => _userId;

  Future<void> startWorkspaceSession(String userId, WorkspaceState state) =>
      startSession(
        userId,
        state.workspaces,
        workspacesResolved:
            state.status == WorkspaceStatus.loaded &&
            (state.workspaces.isNotEmpty || state.emptyMembershipConfirmed),
      );

  Future<void> startSession(
    String userId,
    List<Workspace> workspaces, {
    bool workspacesResolved = true,
  }) async {
    if (_userId != null && _userId != userId) {
      await stopSession();
    }
    if (_userId != userId) {
      _scopeGeneration++;
      _timezoneResolver.clear();
      _userId = userId;
      _workspacesResolved = false;
      _initializing = _initializeSession(userId, _scopeGeneration);
    }
    if (_initializing case final initializing?) await initializing;
    if (_userId != userId) return;
    final wasResolved = _workspacesResolved;
    _workspacesResolved = workspacesResolved;
    if (!workspacesResolved) {
      // Retain recorded alerts until membership is known; initialization still
      // binds their ledger to the account so logout can reconcile it.
      _scopeGeneration++;
      if (_refreshing case final running?) await running;
      return;
    }
    final oldIds = _workspaces.map((workspace) => workspace.id).toSet();
    final newIds = workspaces.map((workspace) => workspace.id).toSet();
    _workspaces = workspaces;
    if (!setEquals(oldIds, newIds) || !wasResolved) {
      _scopeGeneration++;
      if (_refreshing case final running?) await running;
      await refresh();
    } else {
      await refreshIfStale();
    }
  }

  Future<void> _initializeSession(String userId, int generation) async {
    final loadedSettings = await ReminderSettings.load(userId);
    final store = await SharedPreferences.getInstance();
    final lastSuccess = store.getInt('reminders.$userId.lastSuccessAt');
    final nextReminder = store.getInt('reminders.$userId.nextReminderAt');
    final nextAt = nextReminder == null
        ? null
        : DateTime.fromMillisecondsSinceEpoch(nextReminder);
    final storedIds =
        (store.getStringList('reminders.$userId.scheduledIds') ??
                const <String>[])
            .map(int.tryParse)
            .whereType<int>()
            .toSet();
    var pendingIds = <int>{};
    bool? notificationsEnabled;
    try {
      pendingIds = await _notifications.pendingLocalReminderIds();
      notificationsEnabled = await _notifications.notificationsEnabled;
    } on Exception {
      // Status remains unknown until notification services are available.
    }
    if (!_isCurrent(userId, generation)) return;
    settings = loadedSettings;
    status = ReminderStatus(
      lastSuccessAt: lastSuccess == null
          ? null
          : DateTime.fromMillisecondsSinceEpoch(lastSuccess),
      scheduledCount: storedIds.intersection(pendingIds).length,
      notificationsEnabled: notificationsEnabled,
      nextReminderAt: nextAt?.isAfter(_now()) == true ? nextAt : null,
    );
    notifyListeners();
  }

  Future<void> stopSession() async {
    final userId = _userId;
    _scopeGeneration++;
    _timezoneResolver.clear();
    _userId = null;
    _workspaces = const [];
    _workspacesResolved = false;
    if (_initializing case final initializing?) {
      try {
        await initializing;
      } on Exception {
        // Sign-out must clear local alerts even after failed initialization.
      }
    }
    _initializing = null;
    if (_refreshing case final running?) await running;
    if (userId != null) {
      final store = await SharedPreferences.getInstance();
      final key = 'reminders.$userId.scheduledIds';
      for (final id in store.getStringList(key) ?? const <String>[]) {
        final parsed = int.tryParse(id);
        if (parsed != null) {
          try {
            await _notifications.cancelLocalReminder(parsed);
          } on Exception {
            // Continue clearing the remaining reminders during sign-out.
          }
        }
      }
      await store.remove(key);
    }
    settings = const ReminderSettings();
    status = const ReminderStatus();
    notifyListeners();
  }

  Future<void> updateSettings(ReminderSettings next) async {
    final userId = _userId;
    if (userId == null) return;
    // Invalidate an enabled plan before opt-out or offset changes can await.
    // Its recorded OS IDs remain available to the replacement refresh.
    final generation = ++_scopeGeneration;
    settings = next;
    notifyListeners();
    try {
      await next.save(userId);
    } on Object catch (error) {
      if (_isCurrent(userId, generation)) {
        if (_refreshing case final running?) await running;
        if (_isCurrent(userId, generation)) {
          status = status.copyWith(
            error: error.toString(),
            isRefreshing: false,
          );
          notifyListeners();
        }
      }
      rethrow;
    }
    if (!_isCurrent(userId, generation)) return;
    if (_refreshing case final running?) await running;
    if (!_isCurrent(userId, generation)) return;
    await refresh();
  }

  Future<void> refreshIfStale() async {
    if (_userId == null) return;
    try {
      final enabled = await _notifications.notificationsEnabled;
      if (status.notificationsEnabled != enabled) {
        status = status.copyWith(notificationsEnabled: enabled);
        notifyListeners();
      }
    } on Exception {
      // A permission-status lookup must not block the data refresh.
    }
    final lastSuccess = status.lastSuccessAt;
    if (lastSuccess != null &&
        status.scheduledCount > 0 &&
        _now().difference(lastSuccess) < const Duration(minutes: 15)) {
      return;
    }
    await refresh();
  }

  /// Rebuild after initialization and the current refresh finish bookkeeping.
  /// Zone changes never invalidate saved settings or an OS-accepted alert's ID.
  Future<void> timezoneChanged({
    required String userId,
    String? workspaceId,
  }) async {
    if (_userId != userId) return;
    if (_initializing case final initializing?) await initializing;
    if (_userId != userId ||
        (workspaceId != null &&
            !_workspaces.any((workspace) => workspace.id == workspaceId))) {
      return;
    }
    if (_refreshing case final running?) await running;
    if (_userId != userId) return;
    await refresh();
  }

  Future<void> refresh() {
    final existing = _refreshing;
    if (existing != null) return existing;
    final running = _refresh().whenComplete(() => _refreshing = null);
    _refreshing = running;
    return running;
  }

  Future<void> _refresh() async {
    final userId = _userId;
    final generation = _scopeGeneration;
    if (userId == null || !_workspacesResolved) return;
    status = status.copyWith(isRefreshing: true, clearError: true);
    notifyListeners();
    try {
      final allEntries = <ReminderPlanEntry>[];
      final now = _now();
      for (final workspace in _workspaces) {
        if (!_isCurrent(userId, generation)) return;
        final timezone = settings.eventsEnabled
            ? await _timezoneResolver.resolve(
                userId: userId,
                workspaceId: workspace.id,
              )
            : null;
        if (!_isCurrent(userId, generation)) return;
        await Future.wait([
          if (settings.tasksEnabled)
            TaskListCubit.prewarm(
              taskRepository: _taskRepository,
              wsId: workspace.id,
              isPersonal: workspace.personal,
              forceRefresh: true,
            ),
          if (settings.eventsEnabled)
            CalendarCubit.prewarm(
              calendarRepository: _calendarRepository,
              wsId: workspace.id,
              forceRefresh: true,
            ),
        ]);
        if (!_isCurrent(userId, generation)) return;
        final taskState = TaskListCubit.seedStateFor(
          wsId: workspace.id,
          isPersonal: workspace.personal,
        );
        final calendarState = CalendarCubit.seedStateForWorkspace(workspace.id);
        allEntries.addAll(
          buildReminderPlan(
            now: now,
            workspaceId: workspace.id,
            tasks: settings.tasksEnabled
                ? [...?taskState?.todayTasks, ...?taskState?.upcomingTasks]
                : const [],
            events: settings.eventsEnabled
                ? calendarState?.events ?? const []
                : const [],
            taskOffsets: settings.taskOffsets,
            eventOffsets: settings.eventOffsets,
            timezone: timezone,
          ),
        );
      }
      if (!_isCurrent(userId, generation)) return;
      allEntries.sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));
      final seenIds = <int>{};
      final entries = allEntries
          .where((entry) => seenIds.add(entry.notificationId))
          .take(60)
          .toList(growable: false);
      final scheduledIds = entries.map((entry) => entry.notificationId).toSet();
      final language =
          await _settingsRepository.getLocale() ??
          PlatformDispatcher.instance.locale.languageCode;
      await initializeDateFormatting(language == 'vi' ? 'vi' : 'en');
      if (!_isCurrent(userId, generation)) return;
      final l10n = language == 'vi'
          ? AppLocalizationsVi()
          : AppLocalizationsEn();
      final store = await SharedPreferences.getInstance();
      if (!_isCurrent(userId, generation)) return;
      final key = 'reminders.$userId.scheduledIds';
      final previousIds = (store.getStringList(key) ?? const <String>[])
          .map(int.tryParse)
          .whereType<int>()
          .toSet();
      // Record intended IDs before the OS can accept a notification. A session
      // change must be able to reconcile effects even while scheduling awaits.
      final recorded = await store.setStringList(
        key,
        previousIds.union(scheduledIds).map((id) => '$id').toList(),
      );
      if (!recorded) {
        throw StateError('Unable to record reminder reconciliation IDs');
      }
      for (final entry in entries) {
        if (!_isCurrent(userId, generation)) return;
        final copy = reminderNotificationCopy(entry, l10n);
        await _notifications.scheduleLocalReminder(
          id: entry.notificationId,
          scheduledAt: entry.scheduledAt,
          title: copy.title,
          body: copy.body,
          request: PushNavigationRequest(
            notificationId: '',
            openTarget: entry.kind == ReminderKind.task ? 'task' : 'calendar',
            wsId: entry.workspaceId,
            entityId: entry.entityId,
            boardId: entry.boardId,
            userId: userId,
          ),
        );
      }
      for (final id in previousIds.difference(scheduledIds)) {
        if (!_isCurrent(userId, generation)) return;
        await _notifications.cancelLocalReminder(id);
      }
      if (!_isCurrent(userId, generation)) return;
      await store.setStringList(key, scheduledIds.map((id) => '$id').toList());
      final finishedAt = _now();
      await store.setInt(
        'reminders.$userId.lastSuccessAt',
        finishedAt.millisecondsSinceEpoch,
      );
      final nextReminder = entries.firstOrNull?.scheduledAt;
      if (nextReminder == null) {
        await store.remove('reminders.$userId.nextReminderAt');
      } else {
        await store.setInt(
          'reminders.$userId.nextReminderAt',
          nextReminder.millisecondsSinceEpoch,
        );
      }
      if (!_isCurrent(userId, generation)) return;
      status = ReminderStatus(
        lastSuccessAt: finishedAt,
        scheduledCount: entries.length,
        nextReminderAt: nextReminder,
        notificationsEnabled: await _notifications.notificationsEnabled,
      );
    } on Object catch (error) {
      if (_isCurrent(userId, generation)) {
        status = status.copyWith(error: error.toString(), isRefreshing: false);
      }
    } finally {
      if (_isCurrent(userId, generation)) {
        status = status.copyWith(isRefreshing: false);
        notifyListeners();
      }
    }
  }
}

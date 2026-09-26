import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/reminders/reminder_plan.dart';
import 'package:mobile/features/reminders/reminder_settings.dart';
import 'package:mobile/features/tasks/cubit/task_list_cubit.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/gen/app_localizations_vi.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ReminderService extends ChangeNotifier {
  ReminderService._();

  static final ReminderService instance = ReminderService._();

  final _taskRepository = TaskRepository();
  final _calendarRepository = CalendarRepository();
  String? _userId;
  List<Workspace> _workspaces = const [];
  Future<void>? _initializing;
  Future<void>? _refreshing;
  ReminderSettings settings = const ReminderSettings();
  ReminderStatus status = const ReminderStatus();

  String? get userId => _userId;

  Future<void> startSession(String userId, List<Workspace> workspaces) async {
    if (_userId != null && _userId != userId) {
      await stopSession();
    }
    if (_userId != userId) {
      _userId = userId;
      _initializing = _initializeSession(userId);
    }
    if (_initializing case final initializing?) await initializing;
    if (_userId != userId) return;
    final oldIds = _workspaces.map((workspace) => workspace.id).toSet();
    final newIds = workspaces.map((workspace) => workspace.id).toSet();
    _workspaces = workspaces;
    if (!setEquals(oldIds, newIds)) {
      await refresh();
    } else {
      await refreshIfStale();
    }
  }

  Future<void> _initializeSession(String userId) async {
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
      pendingIds = await PushNotificationService.instance
          .pendingLocalReminderIds();
      notificationsEnabled =
          await PushNotificationService.instance.notificationsEnabled;
    } on Exception {
      // Status remains unknown until notification services are available.
    }
    if (_userId != userId) return;
    settings = loadedSettings;
    status = ReminderStatus(
      lastSuccessAt: lastSuccess == null
          ? null
          : DateTime.fromMillisecondsSinceEpoch(lastSuccess),
      scheduledCount: storedIds.intersection(pendingIds).length,
      notificationsEnabled: notificationsEnabled,
      nextReminderAt: nextAt?.isAfter(DateTime.now()) == true ? nextAt : null,
    );
    notifyListeners();
  }

  Future<void> stopSession() async {
    final userId = _userId;
    _userId = null;
    _workspaces = const [];
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
            await PushNotificationService.instance.cancelLocalReminder(parsed);
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
    settings = next;
    notifyListeners();
    await next.save(userId);
    if (_refreshing case final running?) await running;
    await refresh();
  }

  Future<void> refreshIfStale() async {
    if (_userId == null) return;
    try {
      final enabled =
          await PushNotificationService.instance.notificationsEnabled;
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
        DateTime.now().difference(lastSuccess) < const Duration(minutes: 15)) {
      return;
    }
    await refresh();
  }

  Future<void> refresh() {
    final existing = _refreshing;
    if (existing != null) return existing;
    final running = _refresh();
    _refreshing = running;
    return running.whenComplete(() => _refreshing = null);
  }

  Future<void> _refresh() async {
    final userId = _userId;
    if (userId == null || _workspaces.isEmpty) return;
    status = status.copyWith(isRefreshing: true, clearError: true);
    notifyListeners();
    try {
      final allEntries = <ReminderPlanEntry>[];
      final now = DateTime.now();
      for (final workspace in _workspaces) {
        if (_userId != userId) return;
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
          ),
        );
      }
      if (_userId != userId) return;
      allEntries.sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));
      final seenIds = <int>{};
      final entries = allEntries
          .where((entry) => seenIds.add(entry.notificationId))
          .take(60)
          .toList(growable: false);
      final scheduledIds = entries.map((entry) => entry.notificationId).toSet();
      final language =
          await SettingsRepository().getLocale() ??
          PlatformDispatcher.instance.locale.languageCode;
      final l10n = language == 'vi'
          ? AppLocalizationsVi()
          : AppLocalizationsEn();
      final store = await SharedPreferences.getInstance();
      final key = 'reminders.$userId.scheduledIds';
      final previousIds = (store.getStringList(key) ?? const <String>[])
          .map(int.tryParse)
          .whereType<int>()
          .toSet();
      for (final entry in entries) {
        if (_userId != userId) return;
        final when = switch (entry.offset) {
          '3d' => l10n.remindersIn3d,
          '1d' => l10n.remindersIn1d,
          '12h' => l10n.remindersIn12h,
          '3h' => l10n.remindersIn3h,
          '1h' => l10n.remindersIn1h,
          _ => l10n.remindersEventTitle,
        };
        await PushNotificationService.instance.scheduleLocalReminder(
          id: entry.notificationId,
          scheduledAt: entry.scheduledAt,
          title: entry.kind == ReminderKind.task
              ? l10n.remindersTaskTitle
              : entry.isAllDay
              ? l10n.remindersAllDayEvent(entry.title)
              : l10n.remindersUpcomingEvent(when, entry.title),
          body: entry.kind == ReminderKind.task
              ? entry.title
              : entry.isAllDay
              ? when
              : l10n.remindersEventTitle,
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
        await PushNotificationService.instance.cancelLocalReminder(id);
      }
      await store.setStringList(key, scheduledIds.map((id) => '$id').toList());
      final finishedAt = DateTime.now();
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
      status = ReminderStatus(
        lastSuccessAt: finishedAt,
        scheduledCount: entries.length,
        nextReminderAt: nextReminder,
        notificationsEnabled:
            await PushNotificationService.instance.notificationsEnabled,
      );
    } on Object catch (error) {
      status = status.copyWith(error: error.toString(), isRefreshing: false);
    } finally {
      if (_userId == userId) {
        status = status.copyWith(isRefreshing: false);
        notifyListeners();
      }
    }
  }
}

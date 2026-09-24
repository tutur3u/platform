import 'package:flutter/foundation.dart';
import 'package:mobile/features/reminders/reminder_plan.dart';
import 'package:shared_preferences/shared_preferences.dart';

@immutable
class ReminderSettings {
  const ReminderSettings({
    this.tasksEnabled = true,
    this.eventsEnabled = true,
    this.taskOffsets = defaultReminderOffsets,
    this.eventOffsets = defaultReminderOffsets,
  });

  final bool tasksEnabled;
  final bool eventsEnabled;
  final List<String> taskOffsets;
  final List<String> eventOffsets;

  ReminderSettings copyWith({
    bool? tasksEnabled,
    bool? eventsEnabled,
    List<String>? taskOffsets,
    List<String>? eventOffsets,
  }) => ReminderSettings(
    tasksEnabled: tasksEnabled ?? this.tasksEnabled,
    eventsEnabled: eventsEnabled ?? this.eventsEnabled,
    taskOffsets: taskOffsets ?? this.taskOffsets,
    eventOffsets: eventOffsets ?? this.eventOffsets,
  );

  static Future<ReminderSettings> load(String userId) async {
    final store = await SharedPreferences.getInstance();
    final prefix = 'reminders.$userId.';
    List<String> offsets(String key) =>
        (store.getStringList('$prefix$key') ?? defaultReminderOffsets)
            .where(reminderIntervals.containsKey)
            .toSet()
            .toList(growable: false);
    return ReminderSettings(
      tasksEnabled: store.getBool('${prefix}tasksEnabled') ?? true,
      eventsEnabled: store.getBool('${prefix}eventsEnabled') ?? true,
      taskOffsets: offsets('taskOffsets'),
      eventOffsets: offsets('eventOffsets'),
    );
  }

  Future<void> save(String userId) async {
    final store = await SharedPreferences.getInstance();
    final prefix = 'reminders.$userId.';
    await Future.wait([
      store.setBool('${prefix}tasksEnabled', tasksEnabled),
      store.setBool('${prefix}eventsEnabled', eventsEnabled),
      store.setStringList('${prefix}taskOffsets', taskOffsets),
      store.setStringList('${prefix}eventOffsets', eventOffsets),
    ]);
  }
}

@immutable
class ReminderStatus {
  const ReminderStatus({
    this.isRefreshing = false,
    this.lastSuccessAt,
    this.scheduledCount = 0,
    this.nextReminderAt,
    this.notificationsEnabled,
    this.error,
  });

  final bool isRefreshing;
  final DateTime? lastSuccessAt;
  final int scheduledCount;
  final DateTime? nextReminderAt;
  final bool? notificationsEnabled;
  final String? error;

  ReminderStatus copyWith({
    bool? isRefreshing,
    DateTime? lastSuccessAt,
    int? scheduledCount,
    DateTime? nextReminderAt,
    bool? notificationsEnabled,
    String? error,
    bool clearError = false,
  }) => ReminderStatus(
    isRefreshing: isRefreshing ?? this.isRefreshing,
    lastSuccessAt: lastSuccessAt ?? this.lastSuccessAt,
    scheduledCount: scheduledCount ?? this.scheduledCount,
    nextReminderAt: nextReminderAt ?? this.nextReminderAt,
    notificationsEnabled: notificationsEnabled ?? this.notificationsEnabled,
    error: clearError ? null : error ?? this.error,
  );
}

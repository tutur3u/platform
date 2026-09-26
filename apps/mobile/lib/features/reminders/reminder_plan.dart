import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/user_task.dart';

enum ReminderKind { task, event }

const reminderIntervals = <String, Duration>{
  '3d': Duration(days: 3),
  '1d': Duration(days: 1),
  '12h': Duration(hours: 12),
  '3h': Duration(hours: 3),
  '1h': Duration(hours: 1),
};

const defaultReminderOffsets = ['3d', '1d', '12h', '3h', '1h'];

class ReminderPlanEntry {
  const ReminderPlanEntry({
    required this.kind,
    required this.workspaceId,
    required this.entityId,
    required this.title,
    required this.dueAt,
    required this.offset,
    required this.scheduledAt,
    required this.notificationId,
    this.boardId,
    this.isAllDay = false,
  });

  final ReminderKind kind;
  final String workspaceId;
  final String entityId;
  final String title;
  final DateTime dueAt;
  final String offset;
  final DateTime scheduledAt;
  final int notificationId;
  final String? boardId;
  final bool isAllDay;
}

int reminderNotificationId(String key) {
  var hash = 0x811c9dc5;
  for (final unit in key.codeUnits) {
    hash = ((hash ^ unit) * 0x01000193) & 0xffffffff;
  }
  return 0x40000000 | (hash & 0x3fffffff);
}

List<ReminderPlanEntry> buildReminderPlan({
  required DateTime now,
  required String workspaceId,
  required List<UserTask> tasks,
  required List<CalendarEvent> events,
  required List<String> taskOffsets,
  required List<String> eventOffsets,
  int limit = 60,
}) {
  final entries = <ReminderPlanEntry>[];

  void addEntries({
    required ReminderKind kind,
    required String entityId,
    required String title,
    required DateTime dueAt,
    required List<String> offsets,
    String? boardId,
    bool isAllDay = false,
  }) {
    if (!dueAt.isAfter(now)) return;
    for (final offset in offsets.toSet()) {
      final duration = reminderIntervals[offset];
      if (duration == null) continue;
      final scheduledAt = dueAt.subtract(duration);
      if (!scheduledAt.isAfter(now)) continue;
      entries.add(
        ReminderPlanEntry(
          kind: kind,
          workspaceId: workspaceId,
          entityId: entityId,
          title: title,
          dueAt: dueAt,
          offset: offset,
          scheduledAt: scheduledAt,
          notificationId: reminderNotificationId(
            '${kind.name}:$workspaceId:$entityId:$offset',
          ),
          boardId: boardId,
          isAllDay: isAllDay,
        ),
      );
    }
  }

  for (final task in tasks) {
    if (task.isDone || task.endDate == null) continue;
    addEntries(
      kind: ReminderKind.task,
      entityId: task.id,
      title: task.name ?? 'Task',
      dueAt: task.endDate!,
      offsets: taskOffsets,
      boardId: task.list?.board?.id,
    );
  }
  for (final event in events) {
    if (event.isWorkingLocation) continue;
    final start = event.startAt;
    if (start == null) continue;
    final dueAt = event.isAllDay
        ? DateTime(start.year, start.month, start.day, 9)
        : start;
    addEntries(
      kind: ReminderKind.event,
      entityId: event.id,
      title: event.title ?? 'Event',
      dueAt: dueAt,
      offsets: eventOffsets,
      isAllDay: event.isAllDay,
    );
  }

  entries.sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));
  final ids = <int>{};
  return entries
      .where((entry) => ids.add(entry.notificationId))
      .take(limit)
      .toList(growable: false);
}

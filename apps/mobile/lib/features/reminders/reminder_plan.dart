import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';

enum ReminderKind { task, event }

const reminderIntervals = <String, Duration>{
  '3d': Duration(days: 3),
  '1d': Duration(days: 1),
  '12h': Duration(hours: 12),
  '3h': Duration(hours: 3),
  '1h': Duration(hours: 1),
};

const taskOverdueOffset = 'overdue';
const taskOverdueWindow = Duration(days: 1);

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
    this.taskLocation,
    this.isAllDay = false,
    this.timezone,
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
  final String? taskLocation;

  String get taskReceiptKey =>
      taskReminderReceiptKey(workspaceId, entityId, offset, dueAt);
  final bool isAllDay;
  final String? timezone;
}

String taskReminderReceiptKey(
  String workspaceId,
  String entityId,
  String offset,
  DateTime dueAt,
) => '$workspaceId:$entityId:$offset:${dueAt.millisecondsSinceEpoch}';

String taskReminderWorkspaceId(UserTask task, String fallback) {
  final board = task.list?.board;
  return board?.workspace?.id ?? board?.wsId ?? fallback;
}

bool isTaskReminderEligible(UserTask task, String workspaceId) {
  return taskReminderWorkspaceId(task, workspaceId) == workspaceId &&
      !task.isDone &&
      task.closedAt == null &&
      task.deletedAt == null &&
      task.list?.status != 'closed' &&
      task.list?.archived != true;
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
  bool includeOverdue = true,
  String? timezone,
  Set<String> deliveredTaskKeys = const {},
  Map<String, DateTime> pendingOverdueTimes = const {},
  Set<String> retryPendingTaskKeys = const {},
}) {
  final entries = <ReminderPlanEntry>[];

  void addEntries({
    required ReminderKind kind,
    required String entityId,
    required String title,
    required DateTime dueAt,
    required List<String> offsets,
    String? boardId,
    String? taskLocation,
    bool isAllDay = false,
  }) {
    final isOverdue = !dueAt.isAfter(now);
    final availableOffsets = isOverdue
        ? includeOverdue &&
                  kind == ReminderKind.task &&
                  offsets.isNotEmpty &&
                  now.difference(dueAt) < taskOverdueWindow
              ? const [taskOverdueOffset]
              : const <String>[]
        : offsets.toSet();
    for (final offset in availableOffsets) {
      final duration = reminderIntervals[offset];
      if (duration == null && offset != taskOverdueOffset) continue;
      final key = taskReminderReceiptKey(workspaceId, entityId, offset, dueAt);
      final DateTime scheduledAt;
      if (duration == null) {
        scheduledAt =
            pendingOverdueTimes[key] ?? now.add(const Duration(minutes: 1));
      } else {
        final original = dueAt.subtract(duration);
        final retryAt = now.add(const Duration(seconds: 10));
        scheduledAt =
            !original.isAfter(now) &&
                retryPendingTaskKeys.contains(key) &&
                retryAt.isBefore(dueAt)
            ? retryAt
            : original;
      }
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
            kind == ReminderKind.task
                ? 'task:$key'
                : 'event:$workspaceId:$entityId:$offset',
          ),
          boardId: boardId,
          taskLocation: taskLocation,
          isAllDay: isAllDay,
          timezone: timezone,
        ),
      );
    }
  }

  for (final task in tasks) {
    final board = task.list?.board;
    final dueAt = task.endDate;
    if (!isTaskReminderEligible(task, workspaceId) || dueAt == null) continue;
    final wall = calendarWallDate(dueAt, timezone);
    addEntries(
      kind: ReminderKind.task,
      entityId: task.id,
      title: task.name ?? 'Task',
      dueAt: dueAt,
      offsets: taskOffsets,
      boardId: board?.id,
      taskLocation: board?.name ?? task.list?.name,
      // Date-only task editors store the end of the selected day.
      isAllDay: wall.hour == 23 && wall.minute == 59 && wall.second == 59,
    );
  }
  for (final event in events) {
    if (event.isWorkingLocation) continue;
    final start = event.startAt;
    if (start == null) continue;
    final projected = calendarProjectEvent(event, timezone);
    final wallStart = projected.startAt!;
    final dueAt = projected.isAllDay
        ? calendarWallToUtc(
            calendarDate(wallStart.year, wallStart.month, wallStart.day, 9),
            timezone,
          )
        : start;
    addEntries(
      kind: ReminderKind.event,
      entityId: event.id,
      title: event.title ?? 'Event',
      dueAt: dueAt,
      offsets: eventOffsets,
      isAllDay: projected.isAllDay,
    );
  }

  entries.sort((a, b) => a.scheduledAt.compareTo(b.scheduledAt));
  final ids = <int>{};
  return entries
      .where(
        (entry) =>
            (entry.kind != ReminderKind.task ||
                !deliveredTaskKeys.contains(entry.taskReceiptKey)) &&
            ids.add(entry.notificationId),
      )
      .take(limit)
      .toList(growable: false);
}

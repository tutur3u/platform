import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/features/reminders/reminder_plan.dart';

const _groupWindow = Duration(minutes: 5);

/// My Tasks can include a shared task placed on the user's personal board.
void collectTaskReminderCandidates(
  Map<String, Map<String, UserTask?>> byWorkspace,
  String sourceWorkspaceId,
  Iterable<UserTask> tasks, {
  required String userId,
  Iterable<UserTask> inactive = const [],
}) {
  void collect(UserTask task, UserTask? candidate) {
    final target = taskReminderWorkspaceId(task, sourceWorkspaceId);
    final workspaceTasks = byWorkspace[target];
    if (workspaceTasks == null) return;
    if (target == sourceWorkspaceId) {
      workspaceTasks[task.id] = candidate;
    } else if (!task.assignees.any((assignee) => assignee.id == userId)) {
      workspaceTasks.putIfAbsent(task.id, () => candidate);
    }
  }

  for (final task in tasks) {
    collect(task, task);
  }
  for (final task in inactive) {
    collect(task, null);
  }
}

/// Calendar alerts stay independent. Tasks share one alert per workspace and
/// window, anchored at the earliest alert so no deadline is delayed.
List<List<ReminderPlanEntry>> groupReminderEntries(
  Iterable<ReminderPlanEntry> entries, {
  int limit = 60,
}) {
  final sorted = entries.toList()
    ..sort((a, b) {
      final byTime = a.scheduledAt.compareTo(b.scheduledAt);
      return byTime == 0
          ? a.notificationId.compareTo(b.notificationId)
          : byTime;
    });
  final groups = <List<ReminderPlanEntry>>[];
  final taskGroups = <(String, bool), List<ReminderPlanEntry>>{};
  final ids = <int>{};
  for (final entry in sorted) {
    if (!ids.add(entry.notificationId)) continue;
    if (entry.kind == ReminderKind.event) {
      groups.add([entry]);
      continue;
    }
    final key = (entry.workspaceId, entry.offset == taskOverdueOffset);
    final group = taskGroups[key];
    if (group != null &&
        entry.scheduledAt.difference(group.first.scheduledAt) < _groupWindow) {
      group.add(entry);
    } else {
      final next = [entry];
      taskGroups[key] = next;
      groups.add(next);
    }
  }
  return groups.take(limit).toList(growable: false);
}

int reminderGroupId(List<ReminderPlanEntry> group) => group.length == 1
    ? group.first.notificationId
    : reminderNotificationId(
        'group:${group.map((entry) => entry.notificationId).join(':')}',
      );

typedef TaskReminderReceipt = ({int notificationId, DateTime at, bool retry});

/// Restore schedules and any native call interrupted by process death.
Map<String, TaskReminderReceipt> readTaskReminderReceipts(
  Iterable<String> stored,
  DateTime now,
) {
  final cutoff = now.subtract(taskOverdueWindow).millisecondsSinceEpoch;
  final receipts = <String, TaskReminderReceipt>{};
  for (final line in stored) {
    final parts = line.split(' ');
    if (parts.length != 3 && parts.length != 4) continue;
    final firedAt = int.tryParse(parts[1]);
    final id = int.tryParse(parts[2]);
    final dueAt = int.tryParse(parts[0].split(':').last);
    if (id != null && firedAt != null && dueAt != null && dueAt > cutoff) {
      receipts[parts[0]] = (
        notificationId: id,
        at: DateTime.fromMillisecondsSinceEpoch(firedAt),
        retry: parts.length == 4 && parts[3] == 'retry',
      );
    }
  }
  return receipts;
}

List<String> encodeTaskReminderReceipts(
  Map<String, TaskReminderReceipt> receipts,
) => receipts.entries.map((entry) {
  final receipt = entry.value;
  final state = receipt.retry ? 'retry' : 'scheduled';
  return '${entry.key} ${receipt.at.millisecondsSinceEpoch} '
      '${receipt.notificationId} $state';
}).toList();

({Set<int> retain, Set<int> cancel, Set<String> retry})
reconcileDelayedTaskReminders({
  required Iterable<MapEntry<String, TaskReminderReceipt>> elapsed,
  required Map<String, List<UserTask>> eligibleTasks,
  required List<String> offsets,
  required Set<int> pendingIds,
  required DateTime now,
}) {
  if (pendingIds.isEmpty || offsets.isEmpty) {
    return (retain: const {}, cancel: const {}, retry: const {});
  }
  final activeKeys = <String>{};
  for (final workspace in eligibleTasks.entries) {
    for (final task in workspace.value) {
      final dueAt = task.endDate;
      if (dueAt == null || now.difference(dueAt) >= taskOverdueWindow) {
        continue;
      }
      final validOffsets = dueAt.isAfter(now)
          ? offsets
          : const [taskOverdueOffset];
      for (final offset in validOffsets) {
        activeKeys.add(
          taskReminderReceiptKey(workspace.key, task.id, offset, dueAt),
        );
      }
    }
  }
  final retained = <int>{};
  final invalid = <int>{};
  for (final entry in elapsed) {
    final id = entry.value.notificationId;
    if (!pendingIds.contains(id)) continue;
    final canRetain = !entry.value.retry && activeKeys.contains(entry.key);
    (canRetain ? retained : invalid).add(id);
  }
  return (
    retain: retained.difference(invalid),
    cancel: invalid,
    retry: {
      for (final entry in elapsed)
        if (invalid.contains(entry.value.notificationId) &&
            activeKeys.contains(entry.key))
          entry.key,
    },
  );
}

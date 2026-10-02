import 'package:mobile/core/cache/pending_collection_overlay.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/data/models/user_tasks_page.dart';

/// Reprojects queued edits over the authorized user buckets. Unassigned local
/// creates stay in their board rather than leaking into the user's task list.
UserTasksPage overlayPendingUserTasks({
  required String workspaceId,
  required String? userId,
  required UserTasksPage source,
  required List<PendingMutationRecord> pending,
  DateTime? now,
  List<Map<String, dynamic>> cachedLists = const [],
}) {
  final base = '/api/v1/workspaces/$workspaceId/tasks';
  final relevant = pending
      .expand((item) => _expandUserTaskMutation(item, base, userId))
      .where((item) {
        if (item.userId != userId || item.workspaceId != workspaceId) {
          return false;
        }
        if (item.path == base) {
          final assignees = item.payload?['assignee_ids'];
          return assignees is List && assignees.contains(userId);
        }
        if (!item.path.startsWith('$base/')) {
          return false;
        }
        final suffix = item.path.substring(base.length + 1).split('/');
        return suffix.length == 1 ||
            suffix.length == 2 && suffix.last == 'description';
      })
      .toList(growable: false);
  if (relevant.isEmpty) {
    return source;
  }
  final original = [
    ...source.overdue,
    ...source.today,
    ...source.upcoming,
    ...source.completed,
  ];
  final affected = relevant.map((item) => item.entityId).toSet();
  final originalBuckets = <String, String>{
    for (final task in source.overdue) task.id: 'overdue',
    for (final task in source.today) task.id: 'today',
    for (final task in source.upcoming) task.id: 'upcoming',
    for (final task in source.completed) task.id: 'completed',
  };
  final lists = {
    for (final row in cachedLists)
      if (row['id'] is String && row['status'] is String)
        row['id'] as String: TaskListInfo.fromJson(row),
    for (final task in original)
      if (task.list != null) task.list!.id: task.list!,
  };
  final rows = overlayPendingCollection(
    workspaceId: workspaceId,
    feature: 'tasks',
    pathContains: base,
    source: original.map((task) => task.toJson()).toList(),
    pending: relevant,
    normalizeCreate: (payload) => {
      ...payload,
      if (payload['listId'] != null) 'list_id': payload['listId'],
    },
    normalizeUpdate: (payload) => {
      ...payload,
      if (payload['listId'] != null) 'list_id': payload['listId'],
    },
    matchesQuery: (row) => row['deleted'] != true,
  );
  final overdue = <UserTask>[];
  final today = <UserTask>[];
  final upcoming = <UserTask>[];
  final completed = <UserTask>[];
  final clock = (now ?? DateTime.now()).toLocal();
  final start = DateTime(clock.year, clock.month, clock.day);
  final end = DateTime(clock.year, clock.month, clock.day + 1);
  final upcomingEnd = DateTime(clock.year, clock.month, clock.day + 8);
  for (final row in rows) {
    if (row['assignee_ids'] is List &&
        !(row['assignee_ids'] as List).contains(userId)) {
      continue;
    }
    final knownList = lists[row['list_id']];
    if (knownList != null) {
      row['list'] = knownList.toJson();
    } else if (row['list'] is Map &&
        (row['list'] as Map)['id'] != row['list_id']) {
      continue; // Unknown destination cannot inherit the previous list status.
    }
    final task = UserTask.fromJson(row);
    if (task.list?.status == 'closed') continue;
    if (!affected.contains(task.id)) {
      switch (originalBuckets[task.id]) {
        case 'overdue':
          overdue.add(task);
        case 'today':
          today.add(task);
        case 'upcoming':
          upcoming.add(task);
        case 'completed':
          completed.add(task);
      }
    } else if (row['completed'] == true ||
        row['completed'] != false &&
            (task.isDone || task.list?.status == 'review')) {
      completed.add(task);
    } else if (task.endDate != null && task.endDate!.isBefore(clock)) {
      overdue.add(task);
    } else if (task.endDate != null && task.endDate!.isBefore(end) ||
        task.startDate != null &&
            !task.startDate!.isBefore(start) &&
            task.startDate!.isBefore(end)) {
      today.add(task);
    } else if (task.endDate == null || task.endDate!.isBefore(upcomingEnd)) {
      upcoming.add(task);
    }
  }
  int byDate(UserTask a, UserTask b) =>
      (a.endDate ?? DateTime(1970)).compareTo(b.endDate ?? DateTime(1970));
  overdue.sort(byDate);
  today.sort(byDate);
  const priorities = {'critical': 4, 'high': 3, 'normal': 2, 'low': 1};
  upcoming.sort((a, b) {
    if (a.endDate != null && b.endDate != null) return byDate(a, b);
    if (a.endDate != null) return -1;
    if (b.endDate != null) return 1;
    final priority = (priorities[b.priority ?? 'normal'] ?? 0).compareTo(
      priorities[a.priority ?? 'normal'] ?? 0,
    );
    if (priority != 0) return priority;
    return (b.createdAt ?? DateTime(1970)).compareTo(
      a.createdAt ?? DateTime(1970),
    );
  });
  final activeDelta =
      overdue.length +
      today.length +
      upcoming.length -
      source.overdue.length -
      source.today.length -
      source.upcoming.length;
  return UserTasksPage(
    overdue: overdue,
    today: today,
    upcoming: upcoming,
    completed: completed,
    totalActiveTasks: (source.totalActiveTasks + activeDelta).clamp(0, 1 << 30),
    totalCompletedTasks:
        (source.totalCompletedTasks +
                completed.length -
                source.completed.length)
            .clamp(0, 1 << 30),
    hasMoreCompleted: source.hasMoreCompleted,
    completedPage: source.completedPage,
  );
}

Iterable<PendingMutationRecord> _expandUserTaskMutation(
  PendingMutationRecord item,
  String base,
  String? userId,
) sync* {
  if (item.path != '$base/bulk') {
    yield item;
    return;
  }
  final operation = item.payload?['operation'];
  final ids = item.payload?['taskIds'];
  if (operation is! Map<String, dynamic> || ids is! List) {
    return;
  }
  final payload = switch (operation['type']) {
    'update_fields' => operation['updates'],
    'move_to_list' => {'list_id': operation['listId']},
    'clear_assignees' => {'assignee_ids': <String>[]},
    'remove_assignee' when operation['assigneeId'] == userId => {
      'assignee_ids': <String>[],
    },
    _ => null,
  };
  if (payload is! Map<String, dynamic>) {
    return;
  }
  for (final id in ids.whereType<String>()) {
    yield PendingMutationRecord(
      id: '${item.id}:$id',
      feature: item.feature,
      method: 'PUT',
      path: '$base/$id',
      createdAt: item.createdAt,
      workspaceId: item.workspaceId,
      userId: item.userId,
      payload: payload,
      optimisticPatch: {'entityId': id},
      status: item.status,
    );
  }
}

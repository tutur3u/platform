import 'dart:math' as math;

import 'package:mobile/data/models/task_board_task.dart';

const _sortKeySpacing = 1000000;
const _maximumSortKey = 9007199254740991;

int compareKanbanTasks(TaskBoardTask a, TaskBoardTask b) {
  final key = (a.sortKey ?? _maximumSortKey + 1).compareTo(
    b.sortKey ?? _maximumSortKey + 1,
  );
  if (key != 0) return key;
  final aCreated = a.createdAt?.millisecondsSinceEpoch ?? 0;
  final bCreated = b.createdAt?.millisecondsSinceEpoch ?? 0;
  return bCreated.compareTo(aCreated);
}

/// Uses a sparse integer between the neighbours. If no integer fits,
/// spreads the smallest surrounding run that has room using its outer keys.
Map<String, int> kanbanPlacementKeys(
  List<TaskBoardTask> others, {
  required String taskId,
  required int index,
}) {
  var start = index;
  var end = index;
  var left = start == 0 ? 0 : others[start - 1].sortKey;
  var right = end == others.length ? _maximumSortKey : others[end].sortKey;
  if (left != null && (right == null || right - left > 1)) {
    return {taskId: _keyBetween(left, right)};
  }

  // Null keys sort after persisted keys. Include the unkeyed predecessors
  // before numbering the insertion, leaving later unkeyed tasks in place.
  while (left == null && start > 0) {
    start--;
    left = start == 0 ? 0 : others[start - 1].sortKey;
  }
  while ((right ?? _maximumSortKey) - left! <= end - start + 1) {
    if (end < others.length) {
      end++;
      right = end == others.length ? _maximumSortKey : others[end].sortKey;
    } else {
      start--;
      left = start == 0 ? 0 : others[start - 1].sortKey;
    }
  }

  final ids = [
    for (var i = start; i < index; i++) others[i].id,
    taskId,
    for (var i = index; i < end; i++) others[i].id,
  ];
  final step = math.min(
    _sortKeySpacing,
    ((right ?? _maximumSortKey) - left) ~/ (ids.length + 1),
  );
  return {for (var i = 0; i < ids.length; i++) ids[i]: left + (i + 1) * step};
}

int _keyBetween(int left, int? right) {
  if (left == 0 && (right == null || right == _maximumSortKey)) {
    return _sortKeySpacing;
  }
  final gap = (right ?? _maximumSortKey) - left;
  return left + math.min(_sortKeySpacing, gap ~/ 2);
}

import 'dart:math' as math;

import 'package:mobile/data/models/task_board_list.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/features/tasks_boards/utils/task_due_dates.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_lane_packing.dart';
import 'package:mobile/features/tasks_boards/utils/task_timeline_window.dart';

/// One row of the board timeline body.
sealed class TaskTimelineRow {
  const TaskTimelineRow();
}

/// A group caption: the overdue group when [listId] is null, else a list.
class TaskTimelineCaption extends TaskTimelineRow {
  const TaskTimelineCaption.overdue(int this.overdueCount) : listId = null;

  const TaskTimelineCaption.list(String this.listId) : overdueCount = null;

  final String? listId;
  final int? overdueCount;

  bool get isOverdue => listId == null;
}

/// Non-overlapping bars packed into one horizontal lane.
class TaskTimelineLane extends TaskTimelineRow {
  const TaskTimelineLane(this.bars);

  final List<TaskTimelineBar> bars;
}

/// A task's bar across the window's day columns.
class TaskTimelineBar extends TaskTimelineRow {
  const TaskTimelineBar({
    required this.task,
    required this.start,
    required this.end,
    required this.firstColumn,
    required this.lastColumn,
    this.daysLate = 0,
    this.done = false,
  });

  final TaskBoardTask task;

  /// The task's first and last calendar day, in the user's zone.
  final DateTime start;
  final DateTime end;

  /// The columns the bar covers, clamped to the window.
  final int firstColumn;
  final int lastColumn;

  /// Days past the due day; zero unless overdue.
  final int daysLate;

  /// Completed or closed work, drawn faded and struck through.
  final bool done;

  bool get overdue => daysLate > 0;

  int get columnSpan => lastColumn - firstColumn + 1;
}

/// The board timeline laid out for one window.
class TaskTimelineProjection {
  const TaskTimelineProjection({
    required this.window,
    required this.today,
    required this.rows,
    required this.undatedCount,
  });

  final TaskTimelineWindow window;
  final DateTime today;

  /// Overdue group first (only while the window holds today), then one group
  /// per list in board order. Empty groups are left out.
  final List<TaskTimelineRow> rows;

  /// Open tasks with neither a start nor a due date.
  final int undatedCount;

  bool get isEmpty => rows.isEmpty;
}

/// Lays the tasks of [lists] (board order) out across [window].
///
/// A task without a due date runs from its start through today while open.
/// Overdue means open, due before [today], in a list that keeps deadlines;
/// overdue tasks gather in the leading group whenever the window holds
/// today, wherever their dates fall. Runs in O(n log n) for n tasks.
TaskTimelineProjection buildTaskTimelineProjection({
  required List<TaskBoardList> lists,
  required Map<String, List<TaskBoardTask>> tasksByList,
  required TaskTimelineWindow window,
  required DateTime today,
  String? zone,
}) {
  final showsToday = window.contains(today);
  final overdue = <TaskTimelineBar>[];
  final groups = <String, List<TaskTimelineBar>>{};
  var undated = 0;

  for (final list in lists) {
    final listDone = list.completesWork;
    for (final task in tasksByList[list.id] ?? const <TaskBoardTask>[]) {
      final done = listDone || task.completed == true || task.closedAt != null;
      final startDate = task.startDate;
      final endDate = task.endDate;
      if (startDate == null && endDate == null) {
        if (!done) undated += 1;
        continue;
      }
      final a = taskDay(startDate ?? endDate!, zone);
      var b = taskDay(endDate ?? startDate!, zone);
      if (endDate == null && !done && b.isBefore(today)) b = today;
      final start = a.isAfter(b) ? b : a;
      final end = a.isAfter(b) ? a : b;
      final late = !done && endDate != null && !list.suppressesDeadlines
          ? daysBetween(end, today)
          : 0;
      final first = window.columnOf(start);
      final last = window.columnOf(end);
      final isOverdue = late > 0;
      if (isOverdue && showsToday) {
        final lastColumn = last.clamp(0, window.days - 1);
        overdue.add(
          TaskTimelineBar(
            task: task,
            start: start,
            end: end,
            firstColumn: math.min(first.clamp(0, window.days - 1), lastColumn),
            lastColumn: lastColumn,
            daysLate: late,
          ),
        );
        continue;
      }
      if (last < 0 || first >= window.days) continue;
      groups
          .putIfAbsent(list.id, () => [])
          .add(
            TaskTimelineBar(
              task: task,
              start: start,
              end: end,
              firstColumn: math.max(first, 0),
              lastColumn: math.min(last, window.days - 1),
              daysLate: isOverdue ? late : 0,
              done: done,
            ),
          );
    }
  }

  overdue.sort((x, y) {
    final byLate = x.daysLate.compareTo(y.daysLate);
    return byLate != 0 ? byLate : _compareTasks(x.task, y.task);
  });
  final rows = <TaskTimelineRow>[
    if (overdue.isNotEmpty) ...[
      TaskTimelineCaption.overdue(overdue.length),
      for (final lane in packTaskTimelineBarsIntoLanes(overdue))
        TaskTimelineLane(lane),
    ],
  ];
  for (final list in lists) {
    final bars = groups[list.id];
    if (bars == null) continue;
    bars.sort(_compareBars);
    rows.add(TaskTimelineCaption.list(list.id));
    for (final lane in packTaskTimelineBarsIntoLanes(bars)) {
      rows.add(TaskTimelineLane(lane));
    }
  }
  return TaskTimelineProjection(
    window: window,
    today: today,
    rows: rows,
    undatedCount: undated,
  );
}

int _compareBars(TaskTimelineBar a, TaskTimelineBar b) {
  final byStart = a.start.compareTo(b.start);
  if (byStart != 0) return byStart;
  final byEnd = a.end.compareTo(b.end);
  return byEnd != 0 ? byEnd : _compareTasks(a.task, b.task);
}

int _compareTasks(TaskBoardTask a, TaskBoardTask b) {
  final byName = (a.name ?? '').toLowerCase().compareTo(
    (b.name ?? '').toLowerCase(),
  );
  return byName != 0 ? byName : a.id.compareTo(b.id);
}

/// Rebuilds the projection only when its inputs change.
///
/// The board state regroups tasks into new collections on every build but
/// reuses the task objects, so inputs compare by element identity: O(n)
/// with no allocation, against O(n log n) for a rebuild.
class TaskTimelineProjectionCache {
  /// How many times the projection was built; for tests.
  int builds = 0;

  TaskTimelineProjection? _projection;
  List<TaskBoardList> _lists = const [];
  Map<String, List<TaskBoardTask>> _tasksByList = const {};
  String? _zone;

  TaskTimelineProjection resolve({
    required List<TaskBoardList> lists,
    required Map<String, List<TaskBoardTask>> tasksByList,
    required TaskTimelineWindow window,
    required DateTime today,
    String? zone,
  }) {
    final cached = _projection;
    if (cached != null &&
        cached.window == window &&
        cached.today == today &&
        zone == _zone &&
        _sameLists(lists) &&
        _sameTasks(lists, tasksByList)) {
      return cached;
    }
    builds += 1;
    _lists = List.of(lists);
    _tasksByList = {
      for (final list in lists)
        list.id: tasksByList[list.id] ?? const <TaskBoardTask>[],
    };
    _zone = zone;
    return _projection = buildTaskTimelineProjection(
      lists: lists,
      tasksByList: tasksByList,
      window: window,
      today: today,
      zone: zone,
    );
  }

  bool _sameLists(List<TaskBoardList> lists) {
    if (lists.length != _lists.length) return false;
    for (var i = 0; i < lists.length; i++) {
      if (lists[i] != _lists[i]) return false;
    }
    return true;
  }

  bool _sameTasks(
    List<TaskBoardList> lists,
    Map<String, List<TaskBoardTask>> tasksByList,
  ) {
    for (final list in lists) {
      final next = tasksByList[list.id] ?? const <TaskBoardTask>[];
      final previous = _tasksByList[list.id] ?? const <TaskBoardTask>[];
      if (identical(next, previous)) continue;
      if (next.length != previous.length) return false;
      for (var i = 0; i < next.length; i++) {
        if (!identical(next[i], previous[i])) return false;
      }
    }
    return true;
  }
}

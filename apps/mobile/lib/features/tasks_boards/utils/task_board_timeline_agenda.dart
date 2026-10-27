import 'package:mobile/data/models/task_board_task.dart';

/// How far ahead the board timeline lists upcoming work.
enum TaskTimelineRange {
  /// Today and the next six days.
  week(7),

  /// Today and the next thirty days.
  month(31),

  /// Every scheduled task.
  all(null);

  const TaskTimelineRange(this.days);

  /// Days shown from today, inclusive; null shows everything.
  final int? days;
}

/// Why a task sits on its agenda day.
enum TaskTimelinePlacement {
  /// Ended before today and is still open: listed on its last day.
  overdue,

  /// Started before today and runs through today: carried onto today.
  ongoing,

  /// A multi-day task starting on this day.
  starts,

  /// A one-day task on this day.
  single,
}

/// One task on the agenda with its normalized day span.
class TaskTimelineEntry {
  const TaskTimelineEntry({
    required this.task,
    required this.start,
    required this.end,
    required this.placement,
  });

  final TaskBoardTask task;
  final DateTime start;
  final DateTime end;
  final TaskTimelinePlacement placement;

  /// Days the task spans, inclusive.
  int get spanDays => _dayDifference(start, end) + 1;
}

/// The tasks listed on one local day.
class TaskTimelineDay {
  const TaskTimelineDay({required this.day, required this.entries});

  final DateTime day;
  final List<TaskTimelineEntry> entries;
}

/// A board's scheduled work as a day-grouped agenda anchored on today.
///
/// Each task appears once: open tasks that ended before today on their last
/// day ([past], overdue), tasks running today on [today], and later tasks on
/// their first day ([upcoming]). Overdue work ignores the range because it
/// still needs action.
class TaskTimelineAgenda {
  const TaskTimelineAgenda({
    required this.today,
    required this.past,
    required this.upcoming,
    required this.unscheduled,
    required this.hasHiddenLater,
  });

  final TaskTimelineDay today;

  /// Overdue days, nearest first, so they read upward from today.
  final List<TaskTimelineDay> past;

  /// Days after today inside the range, in order.
  final List<TaskTimelineDay> upcoming;

  /// Open tasks with neither a start nor an end date.
  final List<TaskBoardTask> unscheduled;

  /// Whether the range hides later scheduled tasks.
  final bool hasHiddenLater;

  bool get hasScheduled =>
      past.isNotEmpty ||
      today.entries.isNotEmpty ||
      upcoming.isNotEmpty ||
      hasHiddenLater;
}

/// Builds the agenda for the open [tasks] as of [now].
///
/// Runs in O(n log n) for n tasks; callers memoize it per input change.
TaskTimelineAgenda buildTaskTimelineAgenda({
  required Iterable<TaskBoardTask> tasks,
  required DateTime now,
  required TaskTimelineRange range,
}) {
  final today = _day(now);
  final rangeDays = range.days;
  final lastDay = rangeDays == null
      ? null
      : DateTime(today.year, today.month, today.day + rangeDays - 1);
  final past = <DateTime, List<TaskTimelineEntry>>{};
  final todayEntries = <TaskTimelineEntry>[];
  final upcoming = <DateTime, List<TaskTimelineEntry>>{};
  final unscheduled = <TaskBoardTask>[];
  var hasHiddenLater = false;

  for (final task in tasks) {
    final rawStart = task.startDate ?? task.endDate;
    final rawEnd = task.endDate ?? task.startDate;
    if (rawStart == null || rawEnd == null) {
      unscheduled.add(task);
      continue;
    }
    final a = _day(rawStart.toLocal());
    final b = _day(rawEnd.toLocal());
    final start = a.isAfter(b) ? b : a;
    final end = a.isAfter(b) ? a : b;
    final multiDay = start != end;

    if (end.isBefore(today)) {
      past
          .putIfAbsent(end, () => [])
          .add(
            TaskTimelineEntry(
              task: task,
              start: start,
              end: end,
              placement: TaskTimelinePlacement.overdue,
            ),
          );
    } else if (!start.isAfter(today)) {
      todayEntries.add(
        TaskTimelineEntry(
          task: task,
          start: start,
          end: end,
          placement: start.isBefore(today)
              ? TaskTimelinePlacement.ongoing
              : multiDay
              ? TaskTimelinePlacement.starts
              : TaskTimelinePlacement.single,
        ),
      );
    } else if (lastDay != null && start.isAfter(lastDay)) {
      hasHiddenLater = true;
    } else {
      upcoming
          .putIfAbsent(start, () => [])
          .add(
            TaskTimelineEntry(
              task: task,
              start: start,
              end: end,
              placement: multiDay
                  ? TaskTimelinePlacement.starts
                  : TaskTimelinePlacement.single,
            ),
          );
    }
  }

  List<TaskTimelineDay> days(
    Map<DateTime, List<TaskTimelineEntry>> byDay, {
    required bool descending,
  }) {
    final keys = byDay.keys.toList()
      ..sort((x, y) => descending ? y.compareTo(x) : x.compareTo(y));
    return [
      for (final key in keys)
        TaskTimelineDay(day: key, entries: byDay[key]!..sort(_compareEntries)),
    ];
  }

  return TaskTimelineAgenda(
    today: TaskTimelineDay(
      day: today,
      entries: todayEntries..sort(_compareEntries),
    ),
    past: days(past, descending: true),
    upcoming: days(upcoming, descending: false),
    unscheduled: unscheduled..sort(_compareTasks),
    hasHiddenLater: hasHiddenLater,
  );
}

const _priorityRank = {'critical': 0, 'high': 1, 'normal': 2, 'low': 3};

/// Sooner deadlines first, then higher priority, then name.
int _compareEntries(TaskTimelineEntry a, TaskTimelineEntry b) {
  final byEnd = a.end.compareTo(b.end);
  if (byEnd != 0) return byEnd;
  return _compareTasks(a.task, b.task);
}

int _compareTasks(TaskBoardTask a, TaskBoardTask b) {
  final byPriority = (_priorityRank[a.priority] ?? 4).compareTo(
    _priorityRank[b.priority] ?? 4,
  );
  if (byPriority != 0) return byPriority;
  final byName = (a.name ?? '').toLowerCase().compareTo(
    (b.name ?? '').toLowerCase(),
  );
  return byName != 0 ? byName : a.id.compareTo(b.id);
}

DateTime _day(DateTime value) => DateTime(value.year, value.month, value.day);

/// Calendar-day difference that ignores daylight-saving hour shifts.
int _dayDifference(DateTime from, DateTime to) => DateTime.utc(
  to.year,
  to.month,
  to.day,
).difference(DateTime.utc(from.year, from.month, from.day)).inDays;

/// The 1-based day of [entry] that [day] falls on.
int taskTimelineDayOfSpan(TaskTimelineEntry entry, DateTime day) =>
    _dayDifference(entry.start, day) + 1;

/// Rebuilds the agenda only when its inputs change.
///
/// The board state hands the timeline a freshly grouped map on every build,
/// but the task objects inside are reused, so comparing them by identity is
/// O(n) with no allocation, against O(n log n) for a rebuild.
class TaskTimelineAgendaCache {
  /// How many times the agenda was built; for tests.
  int builds = 0;

  TaskTimelineAgenda? _agenda;
  List<String> _listIds = const [];
  Map<String, List<TaskBoardTask>> _tasksByList = const {};
  DateTime? _day;
  TaskTimelineRange? _range;

  /// The agenda for the tasks of [listIds], in that list order.
  TaskTimelineAgenda resolve({
    required List<String> listIds,
    required Map<String, List<TaskBoardTask>> tasksByList,
    required DateTime now,
    required TaskTimelineRange range,
  }) {
    final day = _day0(now);
    final cached = _agenda;
    if (cached != null &&
        day == _day &&
        range == _range &&
        _sameIds(listIds) &&
        _sameTasks(listIds, tasksByList)) {
      return cached;
    }
    builds += 1;
    _listIds = List.of(listIds);
    _tasksByList = {
      for (final id in listIds) id: tasksByList[id] ?? const <TaskBoardTask>[],
    };
    _day = day;
    _range = range;
    final visible = listIds.toSet();
    return _agenda = buildTaskTimelineAgenda(
      tasks: [
        for (final id in listIds)
          for (final task in tasksByList[id] ?? const <TaskBoardTask>[])
            if (visible.contains(task.listId)) task,
      ],
      now: now,
      range: range,
    );
  }

  bool _sameIds(List<String> listIds) {
    if (listIds.length != _listIds.length) return false;
    for (var i = 0; i < listIds.length; i++) {
      if (listIds[i] != _listIds[i]) return false;
    }
    return true;
  }

  bool _sameTasks(
    List<String> listIds,
    Map<String, List<TaskBoardTask>> tasksByList,
  ) {
    for (final id in listIds) {
      final next = tasksByList[id] ?? const <TaskBoardTask>[];
      final previous = _tasksByList[id] ?? const <TaskBoardTask>[];
      if (identical(next, previous)) continue;
      if (next.length != previous.length) return false;
      for (var i = 0; i < next.length; i++) {
        if (!identical(next[i], previous[i])) return false;
      }
    }
    return true;
  }

  static DateTime _day0(DateTime value) =>
      DateTime(value.year, value.month, value.day);
}

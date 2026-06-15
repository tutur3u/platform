const taskBoardTimelineMaxVisibleDays = 730;
const taskBoardTimelinePastPaddingDays = 3;
const taskBoardTimelineFuturePaddingDays = 7;

class TaskBoardTimelineSchedule {
  const TaskBoardTimelineSchedule({
    required this.startDate,
    required this.endDate,
  });

  final DateTime startDate;
  final DateTime endDate;
}

class TaskBoardTimelineWindow {
  const TaskBoardTimelineWindow({
    required this.startDate,
    required this.endDate,
  });

  final DateTime startDate;
  final DateTime endDate;

  int get dayCount => endDate.difference(startDate).inDays + 1;

  DateTime clampDate(DateTime value) {
    final normalized = _normalizeTimelineDay(value);
    if (normalized.isBefore(startDate)) {
      return startDate;
    }
    if (normalized.isAfter(endDate)) {
      return endDate;
    }
    return normalized;
  }
}

TaskBoardTimelineWindow resolveTaskBoardTimelineWindow({
  required Iterable<TaskBoardTimelineSchedule> schedules,
  required DateTime now,
  int maxVisibleDays = taskBoardTimelineMaxVisibleDays,
  int pastPaddingDays = taskBoardTimelinePastPaddingDays,
  int futurePaddingDays = taskBoardTimelineFuturePaddingDays,
}) {
  if (maxVisibleDays < 1) {
    throw ArgumentError.value(
      maxVisibleDays,
      'maxVisibleDays',
      'must be at least 1',
    );
  }

  DateTime? earliest;
  DateTime? latest;

  for (final schedule in schedules) {
    final normalizedStart = _normalizeTimelineDay(schedule.startDate);
    final normalizedEnd = _normalizeTimelineDay(schedule.endDate);
    final start = normalizedStart.isBefore(normalizedEnd)
        ? normalizedStart
        : normalizedEnd;
    final end = normalizedStart.isBefore(normalizedEnd)
        ? normalizedEnd
        : normalizedStart;

    earliest = earliest == null || start.isBefore(earliest) ? start : earliest;
    latest = latest == null || end.isAfter(latest) ? end : latest;
  }

  final today = _normalizeTimelineDay(now);
  final rawStart = (earliest ?? today).subtract(
    Duration(days: pastPaddingDays),
  );
  final rawEnd = (latest ?? today).add(Duration(days: futurePaddingDays));
  return _boundedTimelineWindow(
    rawStart: rawStart,
    rawEnd: rawEnd,
    anchor: today,
    maxVisibleDays: maxVisibleDays,
  );
}

TaskBoardTimelineWindow _boundedTimelineWindow({
  required DateTime rawStart,
  required DateTime rawEnd,
  required DateTime anchor,
  required int maxVisibleDays,
}) {
  final normalizedStart = _normalizeTimelineDay(rawStart);
  final normalizedEnd = _normalizeTimelineDay(rawEnd);
  final start = normalizedStart.isBefore(normalizedEnd)
      ? normalizedStart
      : normalizedEnd;
  final end = normalizedStart.isBefore(normalizedEnd)
      ? normalizedEnd
      : normalizedStart;

  final rawDayCount = end.difference(start).inDays + 1;
  if (rawDayCount <= maxVisibleDays) {
    return TaskBoardTimelineWindow(startDate: start, endDate: end);
  }

  final maxOffset = Duration(days: maxVisibleDays - 1);
  if (end.isBefore(anchor)) {
    return TaskBoardTimelineWindow(
      startDate: end.subtract(maxOffset),
      endDate: end,
    );
  }
  if (start.isAfter(anchor)) {
    return TaskBoardTimelineWindow(
      startDate: start,
      endDate: start.add(maxOffset),
    );
  }

  final pastDays = maxVisibleDays ~/ 2;
  var visibleStart = anchor.subtract(Duration(days: pastDays));
  var visibleEnd = visibleStart.add(maxOffset);

  if (visibleStart.isBefore(start)) {
    visibleStart = start;
    visibleEnd = visibleStart.add(maxOffset);
  }
  if (visibleEnd.isAfter(end)) {
    visibleEnd = end;
    visibleStart = visibleEnd.subtract(maxOffset);
  }

  return TaskBoardTimelineWindow(
    startDate: visibleStart,
    endDate: visibleEnd,
  );
}

DateTime _normalizeTimelineDay(DateTime value) =>
    DateTime(value.year, value.month, value.day);

import 'package:mobile/data/models/calendar_event.dart';

/// Positioning info for a single event in the timeline.
class EventLayoutInfo {
  const EventLayoutInfo({
    required this.event,
    required this.column,
    required this.totalColumns,
  });

  final CalendarEvent event;

  /// Zero-based column index for horizontal positioning.
  final int column;

  /// Total number of columns in this overlap group.
  final int totalColumns;
}

/// Calculates side-by-side column layout for overlapping timed events.
///
/// Uses greedy interval-graph coloring: events sorted by start time are
/// assigned to the first available column that has no time conflict. Timeline
/// callers include their rendered minimum duration so short cards cannot cover
/// a later card, without changing the underlying event timestamps.
List<EventLayoutInfo> calculateEventLayout(
  List<CalendarEvent> events, {
  Duration minimumDuration = Duration.zero,
}) {
  if (events.isEmpty) return [];

  final sorted = [...events]
    ..sort((a, b) {
      final aStart = a.startAt ?? DateTime(0);
      final bStart = b.startAt ?? DateTime(0);
      final cmp = aStart.compareTo(bStart);
      if (cmp != 0) return cmp;
      // Longer events first so they get column 0.
      final aDur = a.durationMinutes;
      final bDur = b.durationMinutes;
      return bDur.compareTo(aDur);
    });

  // Track column assignments as (event, column).
  final assignments = <(CalendarEvent, int)>[];
  // Track end times per column for overlap detection.
  final columnEnds = <DateTime>[];

  final result = <EventLayoutInfo>[];
  void flushGroup() {
    for (final assignment in assignments) {
      result.add(
        EventLayoutInfo(
          event: assignment.$1,
          column: assignment.$2,
          totalColumns: columnEnds.length,
        ),
      );
    }
    assignments.clear();
    columnEnds.clear();
  }

  for (final event in sorted) {
    final start = event.startAt ?? DateTime(0);
    final timestampEnd = event.endAt ?? start.add(const Duration(minutes: 30));
    final minimumEnd = start.add(minimumDuration);
    final end = timestampEnd.isBefore(minimumEnd) ? minimumEnd : timestampEnd;

    // Half-open intervals that start after every active end form a new
    // connected component. Transitive overlaps retain the same columns.
    if (columnEnds.isNotEmpty &&
        columnEnds.every((end) => !start.isBefore(end))) {
      flushGroup();
    }

    // Find first column where this event doesn't overlap.
    var assigned = -1;
    for (var col = 0; col < columnEnds.length; col++) {
      if (!start.isBefore(columnEnds[col])) {
        assigned = col;
        columnEnds[col] = end;
        break;
      }
    }

    if (assigned == -1) {
      assigned = columnEnds.length;
      columnEnds.add(end);
    }

    assignments.add((event, assigned));
  }

  flushGroup();
  return result;
}

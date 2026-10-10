import 'package:mobile/data/models/calendar_event.dart';

/// Positioning info for a single event in the timeline.
class EventLayoutInfo {
  const EventLayoutInfo({
    required this.event,
    required this.column,
    required this.totalColumns,
    this.paintDuration,
  });

  final CalendarEvent event;

  /// Actual painted extent, including the scoped readable minimum.
  final Duration? paintDuration;

  /// Zero-based column index for horizontal positioning.
  final int column;

  /// Total number of columns in this overlap group.
  final int totalColumns;
}

/// Calculates side-by-side column layout for overlapping timed events.
///
/// Uses greedy interval-graph coloring: events sorted by start time are
/// assigned to the first available column that has no time conflict. Timeline
/// callers include their rendered minimum duration. Singleton temporal
/// components
/// cap that minimum at the next disjoint start; genuine overlap clusters keep
/// their readable physical extent, without changing event timestamps.
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

  // Only singleton temporal components may shrink their readable minimum.
  // Real overlap clusters retain their existing physical tap/readability space.
  final paintEnds = <CalendarEvent, DateTime>{};
  var componentStart = 0;
  var componentEnd =
      sorted.first.endAt ??
      (sorted.first.startAt ?? DateTime(0)).add(const Duration(minutes: 30));
  void sealComponent(int exclusiveEnd) {
    final nextStart = exclusiveEnd < sorted.length
        ? sorted[exclusiveEnd].startAt
        : null;
    for (var i = componentStart; i < exclusiveEnd; i++) {
      final event = sorted[i];
      final start = event.startAt ?? DateTime(0);
      final actualEnd = event.endAt ?? start.add(const Duration(minutes: 30));
      final minimumEnd = start.add(minimumDuration);
      var end = actualEnd.isBefore(minimumEnd) ? minimumEnd : actualEnd;
      if (exclusiveEnd - componentStart == 1 &&
          nextStart != null &&
          nextStart.isBefore(end)) {
        end = nextStart;
      }
      paintEnds[event] = end;
    }
  }

  for (var i = 1; i < sorted.length; i++) {
    final event = sorted[i];
    final start = event.startAt ?? DateTime(0);
    final end = event.endAt ?? start.add(const Duration(minutes: 30));
    if (!start.isBefore(componentEnd)) {
      sealComponent(i);
      componentStart = i;
      componentEnd = end;
    } else if (end.isAfter(componentEnd)) {
      componentEnd = end;
    }
  }
  sealComponent(sorted.length);

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
          paintDuration: paintEnds[assignment.$1]!.difference(
            assignment.$1.startAt ?? DateTime(0),
          ),
        ),
      );
    }
    assignments.clear();
    columnEnds.clear();
  }

  for (final event in sorted) {
    final start = event.startAt ?? DateTime(0);
    final end = paintEnds[event]!;

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

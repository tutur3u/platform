import 'package:mobile/data/models/calendar_event.dart';

/// Span info for an all-day event across visible date columns.
class AllDaySpan {
  const AllDaySpan({
    required this.event,
    required this.startIndex,
    required this.endIndex,
    required this.row,
    this.isMerged = false,
    this.mergedEventIds = const [],
  });

  final CalendarEvent event;

  /// Inclusive column index where the span starts.
  final int startIndex;

  /// Inclusive column index where the span ends.
  final int endIndex;

  /// Row index (0-based) for vertical stacking.
  final int row;

  /// Whether this span was merged from multiple single-day events.
  final bool isMerged;

  /// IDs of events that were merged into this span.
  final List<String> mergedEventIds;

  /// Number of columns this span covers.
  int get span => endIndex - startIndex + 1;
}

/// Result of computing all-day layout.
class AllDayLayoutResult {
  const AllDayLayoutResult({
    required this.spans,
    required this.maxRow,
  });

  final List<AllDaySpan> spans;

  /// Maximum row index (for calculating container height). -1 if empty.
  final int maxRow;
}

/// Calculates span-based layout for all-day events across visible dates.
///
/// Implements the same 3-pass algorithm as the web calendar:
/// 1. Create event spans mapping events to column ranges
/// 2. Merge consecutive single-day events with same title+color
/// 3. Assign rows using a 2D occupied-grid approach
AllDayLayoutResult calculateAllDayLayout({
  required List<DateTime> visibleDates,
  required List<CalendarEvent> events,
}) {
  if (visibleDates.isEmpty || events.isEmpty) {
    return const AllDayLayoutResult(spans: [], maxRow: -1);
  }

  // Normalize visible dates to midnight.
  final dates = visibleDates
      .map((d) => DateTime(d.year, d.month, d.day))
      .toList();

  // --- Pass 1: Create event spans ---
  final rawSpans = <_RawSpan>[];

  for (final event in events) {
    if (!event.isAllDay) continue;
    final eventStart = event.startAt;
    final eventEnd = event.endAt ?? eventStart;
    if (eventStart == null) continue;

    final eStart = DateTime(
      eventStart.year,
      eventStart.month,
      eventStart.day,
    );
    // endAt is exclusive (midnight after last day), so subtract 1 day
    // to get the last inclusive calendar day.
    final exclusiveEnd = DateTime(
      eventEnd!.year,
      eventEnd.month,
      eventEnd.day,
    );
    final eEnd = exclusiveEnd.subtract(const Duration(days: 1));

    // Find column range overlap with visible dates.
    int? startIdx;
    int? endIdx;
    for (var i = 0; i < dates.length; i++) {
      final day = dates[i];
      if (!day.isBefore(eStart) && !day.isAfter(eEnd)) {
        startIdx ??= i;
        endIdx = i;
      }
    }
    if (startIdx == null) continue;

    rawSpans.add(
      _RawSpan(
        event: event,
        startIndex: startIdx,
        endIndex: endIdx!,
        isMultiDay: eEnd.isAfter(eStart),
      ),
    );
  }

  // --- Pass 2: Merge consecutive single-day events ---
  final mergedSpans = <_RawSpan>[];
  final singleDay = <String, List<_RawSpan>>{};

  for (final span in rawSpans) {
    if (span.isMultiDay || span.startIndex != span.endIndex) {
      mergedSpans.add(span);
    } else {
      final key =
          '${(span.event.title ?? '').toLowerCase().trim()}'
          '|${span.event.color ?? 'BLUE'}';
      (singleDay[key] ??= []).add(span);
    }
  }

  for (final group in singleDay.values) {
    group.sort((a, b) => a.startIndex.compareTo(b.startIndex));

    var current = group.first;
    var mergedIds = [current.event.id];

    for (var i = 1; i < group.length; i++) {
      final next = group[i];
      if (next.startIndex == current.endIndex + 1) {
        // Adjacent — extend the span.
        current = _RawSpan(
          event: current.event,
          startIndex: current.startIndex,
          endIndex: next.endIndex,
          isMultiDay: false,
          isMerged: true,
          mergedEventIds: [...mergedIds, next.event.id],
        );
        mergedIds.add(next.event.id);
      } else {
        // Gap — flush current and start new.
        mergedSpans.add(current);
        current = next;
        mergedIds = [next.event.id];
      }
    }
    mergedSpans.add(current);
  }

  // --- Pass 3: Assign rows (longest spans first for optimal packing) ---
  mergedSpans.sort((a, b) {
    final spanDiff = b.span - a.span;
    if (spanDiff != 0) return spanDiff;
    return a.startIndex.compareTo(b.startIndex);
  });

  // occupied[dayIndex][rowIndex] = true if occupied.
  final occupied = List.generate(dates.length, (_) => <bool>[]);
  final result = <AllDaySpan>[];
  var maxRow = -1;

  for (final span in mergedSpans) {
    var row = 0;
    var placed = false;

    while (!placed) {
      var canUse = true;
      for (var d = span.startIndex; d <= span.endIndex; d++) {
        // Extend the occupied list if needed.
        while (occupied[d].length <= row) {
          occupied[d].add(false);
        }
        if (occupied[d][row]) {
          canUse = false;
          break;
        }
      }
      if (canUse) {
        for (var d = span.startIndex; d <= span.endIndex; d++) {
          while (occupied[d].length <= row) {
            occupied[d].add(false);
          }
          occupied[d][row] = true;
        }
        placed = true;
      } else {
        row++;
      }
    }

    if (row > maxRow) maxRow = row;
    result.add(
      AllDaySpan(
        event: span.event,
        startIndex: span.startIndex,
        endIndex: span.endIndex,
        row: row,
        isMerged: span.isMerged,
        mergedEventIds: span.mergedEventIds,
      ),
    );
  }

  return AllDayLayoutResult(spans: result, maxRow: maxRow);
}

/// Internal raw span (before row assignment).
class _RawSpan {
  _RawSpan({
    required this.event,
    required this.startIndex,
    required this.endIndex,
    required this.isMultiDay,
    this.isMerged = false,
    this.mergedEventIds = const [],
  });

  final CalendarEvent event;
  final int startIndex;
  final int endIndex;
  final bool isMultiDay;
  final bool isMerged;
  final List<String> mergedEventIds;

  int get span => endIndex - startIndex + 1;
}

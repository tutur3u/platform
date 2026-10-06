import 'dart:math' as math;

/// Short event cards retain a readable label. Use this same minimum for both
/// painting and overlap grouping, including when the timeline is zoomed.
double timedEventMinimumHeight(double hourHeight, double labelHeight) =>
    math.max(hourHeight / 4, math.max(22, labelHeight));

Duration timedEventMinimumDuration(double hourHeight, double minimumHeight) =>
    Duration(
      microseconds: (minimumHeight / hourHeight * Duration.microsecondsPerHour)
          .ceil(),
    );

/// Preserve sub-minute positions when minimum card height is fractional.
double timedEventStartMinutes(DateTime start) =>
    start.hour * 60 +
    start.minute +
    start.second / 60 +
    start.millisecond / 60000 +
    start.microsecond / 60000000;

double timedEventDurationMinutes(DateTime start, DateTime end) =>
    (end.difference(start).inMicroseconds / Duration.microsecondsPerMinute)
        .clamp(15.0, 1440.0);

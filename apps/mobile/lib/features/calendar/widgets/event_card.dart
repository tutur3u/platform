import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';
import 'package:mobile/features/calendar/utils/event_layout.dart';
import 'package:mobile/features/calendar/utils/timed_event_geometry.dart';

/// A card representing a single timed event on the day timeline.
///
/// Positioned by [EventLayoutInfo] to handle overlapping events (side-by-side
/// columns). Shows a colored left border, title, and time range.
class EventCard extends StatelessWidget {
  const EventCard({
    required this.layoutInfo,
    required this.hourHeight,
    required this.timelineLeft,
    required this.timelineWidth,
    required this.onTap,
    super.key,
  });

  final EventLayoutInfo layoutInfo;
  final double hourHeight;
  final double timelineLeft;
  final double timelineWidth;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final event = layoutInfo.event;
    final start = event.startAt ?? calendarNowInContext(context);
    final end = event.endAt ?? start.add(const Duration(minutes: 30));
    final accentColor = EventColors.inContext(event, context).accent;
    final titleColor = EventColors.inContext(event, context).foreground;

    final startMinutes = timedEventStartMinutes(start);
    final durationMinutes = timedEventDurationMinutes(start, end);

    final top = (startMinutes / 60) * hourHeight;
    final textScaler = MediaQuery.textScalerOf(context);
    final labelHeight =
        textScaler.scale(
          Theme.of(context).textTheme.labelSmall?.fontSize ?? 12,
        ) *
        1.1;
    final naturalHeight = math.max(
      (durationMinutes / 60) * hourHeight,
      timedEventMinimumHeight(hourHeight, labelHeight + 6),
    );
    final height = layoutInfo.paintDuration == null
        ? naturalHeight
        : layoutInfo.paintDuration!.inMicroseconds.clamp(
                0,
                Duration.microsecondsPerDay,
              ) /
              Duration.microsecondsPerHour *
              hourHeight;
    final showTime = height >= labelHeight + textScaler.scale(10) * 1.1 + 6;

    final columnWidth = timelineWidth / layoutInfo.totalColumns;
    final left = timelineLeft + (layoutInfo.column * columnWidth);
    final width = columnWidth - 2; // 2px gap between columns.

    final startTime = _formatTime(start);
    final endTime = _formatTime(end);

    return Positioned(
      top: top,
      left: left,
      width: width,
      height: height,
      child: Semantics(
        button: true,
        label: '${event.title ?? ''}, $startTime – $endTime',
        onTap: onTap,
        excludeSemantics: true,
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            margin: const EdgeInsets.only(right: 1, bottom: 1),
            decoration: BoxDecoration(
              color: EventColors.inContext(event, context).background,
              borderRadius: BorderRadius.circular(6),
              border: Border(left: BorderSide(color: accentColor, width: 3)),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            child: ClipRect(
              child: OverflowBox(
                alignment: Alignment.topLeft,
                minHeight: 0,
                maxHeight: double.infinity,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      event.title ?? '',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        height: 1.1,
                        color: titleColor,
                      ),
                    ),
                    if (showTime)
                      Text(
                        '$startTime – $endTime',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          fontSize: 10,
                          height: 1.1,
                          color: titleColor,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _formatTime(DateTime dt) {
    final hour = dt.hour;
    final minute = dt.minute.toString().padLeft(2, '0');
    final period = hour >= 12 ? 'PM' : 'AM';
    final h = hour == 0
        ? 12
        : hour > 12
        ? hour - 12
        : hour;
    return '$h:$minute $period';
  }
}

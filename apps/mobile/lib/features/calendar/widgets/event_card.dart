import 'package:flutter/material.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';
import 'package:mobile/features/calendar/utils/event_layout.dart';

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
    final start = event.startAt ?? DateTime.now();
    final end = event.endAt ?? start.add(const Duration(minutes: 30));
    final accentColor = EventColors.fromString(event.color);
    final titleColor = EventColors.bright(event.color);

    final startMinutes = start.hour * 60 + start.minute;
    final durationMinutes = end.difference(start).inMinutes.clamp(15, 1440);

    final top = (startMinutes / 60) * hourHeight;
    final height = (durationMinutes / 60) * hourHeight;

    final columnWidth = timelineWidth / layoutInfo.totalColumns;
    final left = timelineLeft + (layoutInfo.column * columnWidth);
    final width = columnWidth - 2; // 2px gap between columns.

    final startTime = _formatTime(start);
    final endTime = _formatTime(end);

    return Positioned(
      top: top,
      left: left,
      width: width,
      height: height.clamp(20, double.infinity),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.only(right: 1, bottom: 1),
          decoration: BoxDecoration(
            color: EventColors.background(event.color),
            borderRadius: BorderRadius.circular(6),
            border: Border(
              left: BorderSide(color: accentColor, width: 3),
            ),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
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
                  color: titleColor,
                ),
              ),
              if (height > 30)
                Text(
                  '$startTime – $endTime',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    fontSize: 10,
                    color: titleColor.withValues(alpha: 0.8),
                  ),
                ),
            ],
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

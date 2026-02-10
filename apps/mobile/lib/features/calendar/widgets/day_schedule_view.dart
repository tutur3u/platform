import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/event_layout.dart';
import 'package:mobile/features/calendar/widgets/all_day_event_bar.dart';
import 'package:mobile/features/calendar/widgets/current_time_indicator.dart';
import 'package:mobile/features/calendar/widgets/event_card.dart';

/// Full-day timeline view showing a 24-hour grid with positioned event cards.
///
/// Features:
/// - All-day events shown in a bar above the timeline
/// - 24-hour grid with 60px per hour
/// - Auto-scrolls to current time on initial display
/// - Long-press on empty area creates event at that time
/// - Swipe left/right to navigate days
class DayScheduleView extends StatefulWidget {
  const DayScheduleView({
    required this.selectedDate,
    required this.allDayEvents,
    required this.timedEvents,
    required this.onEventTap,
    required this.onCreateAtTime,
    required this.onSwipe,
    super.key,
  });

  final DateTime selectedDate;
  final List<CalendarEvent> allDayEvents;
  final List<CalendarEvent> timedEvents;
  final ValueChanged<CalendarEvent> onEventTap;
  final ValueChanged<DateTime> onCreateAtTime;

  /// Called with -1 for swipe right (prev day) or 1 for swipe left (next day).
  final ValueChanged<int> onSwipe;

  @override
  State<DayScheduleView> createState() => _DayScheduleViewState();
}

class _DayScheduleViewState extends State<DayScheduleView> {
  final ScrollController _scrollController = ScrollController();
  static const _hourHeight = 60.0;
  static const _timeGutterWidth = 52.0;
  bool _didAutoScroll = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoScroll());
  }

  @override
  void didUpdateWidget(DayScheduleView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedDate != widget.selectedDate) {
      _didAutoScroll = false;
      WidgetsBinding.instance.addPostFrameCallback((_) => _autoScroll());
    }
  }

  void _autoScroll() {
    if (_didAutoScroll || !_scrollController.hasClients) return;
    _didAutoScroll = true;

    final now = DateTime.now();
    final isToday =
        widget.selectedDate.year == now.year &&
        widget.selectedDate.month == now.month &&
        widget.selectedDate.day == now.day;

    final targetHour = isToday ? (now.hour - 1).clamp(0, 20) : 8;
    final offset = targetHour * _hourHeight;

    unawaited(
      _scrollController.animateTo(
        offset.clamp(0, _scrollController.position.maxScrollExtent),
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      ),
    );
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  bool get _isToday {
    final now = DateTime.now();
    return widget.selectedDate.year == now.year &&
        widget.selectedDate.month == now.month &&
        widget.selectedDate.day == now.day;
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final layouts = calculateEventLayout(widget.timedEvents);

    return GestureDetector(
      onHorizontalDragEnd: (details) {
        final velocity = details.primaryVelocity ?? 0;
        if (velocity > 300) {
          widget.onSwipe(-1); // Swipe right → previous day.
        } else if (velocity < -300) {
          widget.onSwipe(1); // Swipe left → next day.
        }
      },
      child: Column(
        children: [
          AllDayEventBar(
            events: widget.allDayEvents,
            onEventTap: widget.onEventTap,
          ),
          Expanded(
            child: SingleChildScrollView(
              controller: _scrollController,
              child: GestureDetector(
                onLongPressStart: (details) {
                  final localY = details.localPosition.dy;
                  final minutes = (localY / _hourHeight * 60).round();
                  final roundedMinutes = (minutes ~/ 15) * 15;
                  final hour = roundedMinutes ~/ 60;
                  final minute = roundedMinutes % 60;
                  final eventTime = DateTime(
                    widget.selectedDate.year,
                    widget.selectedDate.month,
                    widget.selectedDate.day,
                    hour.clamp(0, 23),
                    minute,
                  );
                  widget.onCreateAtTime(eventTime);
                },
                child: SizedBox(
                  height: 24 * _hourHeight,
                  child: Stack(
                    children: [
                      // Hour grid lines.
                      ...List.generate(24, (hour) {
                        final y = hour * _hourHeight;
                        return Positioned(
                          top: y,
                          left: 0,
                          right: 0,
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(
                                width: _timeGutterWidth,
                                child: Padding(
                                  padding: const EdgeInsets.only(
                                    right: 8,
                                  ),
                                  child: Text(
                                    _formatHour(hour),
                                    textAlign: TextAlign.right,
                                    style: textTheme.labelSmall?.copyWith(
                                      fontSize: 10,
                                      color: colorScheme.onSurfaceVariant,
                                    ),
                                  ),
                                ),
                              ),
                              Expanded(
                                child: Container(
                                  height: 0.5,
                                  color: colorScheme.outlineVariant,
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                      // Event cards.
                      ...layouts.map(
                        (layout) => EventCard(
                          layoutInfo: layout,
                          hourHeight: _hourHeight,
                          timelineLeft: _timeGutterWidth,
                          timelineWidth:
                              MediaQuery.of(context).size.width -
                              _timeGutterWidth -
                              16,
                          onTap: () => widget.onEventTap(layout.event),
                        ),
                      ),
                      // Current time indicator.
                      if (_isToday)
                        const CurrentTimeIndicator(hourHeight: _hourHeight),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatHour(int hour) {
    if (hour == 0) return '12 AM';
    if (hour < 12) return '$hour AM';
    if (hour == 12) return '12 PM';
    return '${hour - 12} PM';
  }
}

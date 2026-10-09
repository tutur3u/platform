import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/utils/event_layout.dart';
import 'package:mobile/features/calendar/utils/timed_event_geometry.dart';
import 'package:mobile/features/calendar/widgets/all_day_event_bar.dart';
import 'package:mobile/features/calendar/widgets/current_time_indicator.dart';
import 'package:mobile/features/calendar/widgets/event_card.dart';
import 'package:mobile/features/calendar/widgets/timeline_zoom_viewport.dart';

/// Full-day timeline view showing a 24-hour grid with positioned event cards.
///
/// Features:
/// - All-day events shown in a bar above the timeline
/// - 24-hour grid with responsive hour height
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
    this.timelineZoom = 1,
    this.zoomScope,
    this.onTimelineZoomEnd,
  });

  final double timelineZoom;
  final Object? zoomScope;
  final ValueChanged<double>? onTimelineZoomEnd;
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
  final GlobalKey _timelineViewportKey = GlobalKey();
  bool Function() _zoomBlocked = () => false;
  bool _didAutoScroll = false;

  double _baseHourHeight(BuildContext context) =>
      responsiveValue(context, compact: 60, medium: 70, expanded: 80);

  double _timeGutterWidth(BuildContext context) =>
      responsiveValue(context, compact: 52, medium: 58, expanded: 64);

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

    final hourH = _baseHourHeight(context) * widget.timelineZoom;
    final now = calendarNowInContext(context);
    final isToday =
        widget.selectedDate.year == now.year &&
        widget.selectedDate.month == now.month &&
        widget.selectedDate.day == now.day;

    final targetHour = isToday ? (now.hour - 1).clamp(0, 20) : 8;
    final offset = (targetHour * hourH).clamp(
      0.0,
      _scrollController.position.maxScrollExtent,
    );

    if (MediaQuery.disableAnimationsOf(context)) {
      _scrollController.jumpTo(offset);
      return;
    }

    unawaited(
      _scrollController.animateTo(
        offset,
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
    final now = calendarNowInContext(context);
    return widget.selectedDate.year == now.year &&
        widget.selectedDate.month == now.month &&
        widget.selectedDate.day == now.day;
  }

  @override
  Widget build(BuildContext context) => TimelineZoomViewport(
    zoom: widget.timelineZoom,
    scope: widget.zoomScope,
    baseHourHeight: _baseHourHeight(context),
    verticalController: _scrollController,
    viewportKey: _timelineViewportKey,

    onZoomEnd: widget.onTimelineZoomEnd,
    builder: _buildZoomedTimeline,
  );

  Widget _buildZoomedTimeline(
    BuildContext context,
    double zoom,
    bool Function() blocked,
  ) {
    _zoomBlocked = blocked;
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final hourH = _baseHourHeight(context) * zoom;
    final layouts = calculateEventLayout(
      widget.timedEvents,
      minimumDuration: timedEventMinimumDuration(
        hourH,
        timedEventMinimumHeight(
          hourH,
          MediaQuery.textScalerOf(
                    context,
                  ).scale(textTheme.labelSmall?.fontSize ?? 12) *
                  1.1 +
              6,
        ),
      ),
    );
    final gutterW = _timeGutterWidth(context);

    return GestureDetector(
      onHorizontalDragEnd: (details) {
        if (_zoomBlocked()) return;
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
            onEventTap: (event) {
              if (!_zoomBlocked()) {
                widget.onEventTap(event);
              }
            },
          ),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final availableWidth = constraints.maxWidth - gutterW - 16;

                return SingleChildScrollView(
                  key: _timelineViewportKey,
                  controller: _scrollController,
                  child: GestureDetector(
                    onLongPressStart: (details) {
                      if (_zoomBlocked()) return;
                      final localY = details.localPosition.dy;
                      final minutes = (localY / hourH * 60).round();
                      final roundedMinutes = (minutes ~/ 15) * 15;
                      final hour = roundedMinutes ~/ 60;
                      final minute = roundedMinutes % 60;
                      final eventTime = calendarDate(
                        widget.selectedDate.year,
                        widget.selectedDate.month,
                        widget.selectedDate.day,
                        hour.clamp(0, 23),
                        minute,
                      );
                      widget.onCreateAtTime(eventTime);
                    },
                    child: SizedBox(
                      height: 24 * hourH,
                      child: Stack(
                        children: [
                          // Hour grid lines.
                          ...List.generate(24, (hour) {
                            final y = hour * hourH;
                            return Positioned(
                              top: y,
                              left: 0,
                              right: 0,
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  SizedBox(
                                    width: gutterW,
                                    child: Padding(
                                      padding: const EdgeInsets.only(right: 8),
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
                              hourHeight: hourH,
                              timelineLeft: gutterW,
                              timelineWidth: availableWidth,
                              onTap: () {
                                if (!_zoomBlocked()) {
                                  widget.onEventTap(layout.event);
                                }
                              },
                            ),
                          ),
                          // Current time indicator.
                          if (_isToday) CurrentTimeIndicator(hourHeight: hourH),
                        ],
                      ),
                    ),
                  ),
                );
              },
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

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/all_day_layout.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';
import 'package:mobile/features/calendar/utils/event_layout.dart';
import 'package:mobile/features/calendar/widgets/current_time_indicator.dart';
import 'package:mobile/l10n/l10n.dart';

part 'multi_day_schedule_components.dart';

class MultiDayScheduleView extends StatefulWidget {
  const MultiDayScheduleView({
    required this.selectedDate,
    required this.events,
    required this.onEventTap,
    required this.onCreateAtTime,
    required this.onDaySelected,
    required this.onSwipe,
    required this.visibleDayCount,
    super.key,
    this.alignToWeekStart = false,
    this.firstDayOfWeek = 0,
  });

  final DateTime selectedDate;
  final List<CalendarEvent> events;
  final ValueChanged<CalendarEvent> onEventTap;
  final ValueChanged<DateTime> onCreateAtTime;
  final ValueChanged<DateTime> onDaySelected;
  final ValueChanged<int> onSwipe;
  final int visibleDayCount;
  final bool alignToWeekStart;
  final int firstDayOfWeek;

  @override
  State<MultiDayScheduleView> createState() => _MultiDayScheduleViewState();
}

class _MultiDayScheduleViewState extends State<MultiDayScheduleView> {
  final ScrollController _verticalController = ScrollController();
  final ScrollController _headerController = ScrollController();
  final ScrollController _allDayController = ScrollController();
  final ScrollController _gridController = ScrollController();

  bool _didAutoScroll = false;
  bool _syncingHorizontalScroll = false;

  List<ScrollController> get _horizontalControllers => [
    _headerController,
    _allDayController,
    _gridController,
  ];

  double _hourHeight(BuildContext context) =>
      responsiveValue(context, compact: 58, medium: 64, expanded: 70);

  double _timeGutterWidth(BuildContext context) =>
      responsiveValue(context, compact: 52, medium: 58, expanded: 64);

  double _minDayColumnWidth(BuildContext context) =>
      responsiveValue(context, compact: 112, medium: 124, expanded: 136);

  @override
  void initState() {
    super.initState();
    for (final controller in _horizontalControllers) {
      controller.addListener(() => _syncHorizontalScroll(controller));
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoScroll());
  }

  @override
  void didUpdateWidget(covariant MultiDayScheduleView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedDate != widget.selectedDate ||
        oldWidget.visibleDayCount != widget.visibleDayCount ||
        oldWidget.alignToWeekStart != widget.alignToWeekStart) {
      _didAutoScroll = false;
      WidgetsBinding.instance.addPostFrameCallback((_) => _autoScroll());
    }
  }

  void _syncHorizontalScroll(ScrollController source) {
    if (_syncingHorizontalScroll || !source.hasClients) {
      return;
    }

    _syncingHorizontalScroll = true;
    final sourceOffset = source.offset;
    for (final controller in _horizontalControllers) {
      if (identical(controller, source) || !controller.hasClients) {
        continue;
      }
      final clampedOffset = sourceOffset.clamp(
        0.0,
        controller.position.maxScrollExtent,
      );
      if ((controller.offset - clampedOffset).abs() > 0.5) {
        controller.jumpTo(clampedOffset);
      }
    }
    _syncingHorizontalScroll = false;
  }

  void _autoScroll() {
    if (_didAutoScroll || !_verticalController.hasClients) {
      return;
    }

    _didAutoScroll = true;
    final hourHeight = _hourHeight(context);
    final hasTodayInRange = _visibleDates.any(_isToday);
    final now = DateTime.now();
    final targetHour = hasTodayInRange ? (now.hour - 1).clamp(0, 20) : 8;
    final targetOffset = targetHour * hourHeight;

    unawaited(
      _verticalController.animateTo(
        targetOffset.clamp(0, _verticalController.position.maxScrollExtent),
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
      ),
    );
  }

  List<DateTime> get _visibleDates {
    final anchor = DateTime(
      widget.selectedDate.year,
      widget.selectedDate.month,
      widget.selectedDate.day,
    );
    final startDate = widget.alignToWeekStart
        ? _weekStart(anchor, widget.firstDayOfWeek)
        : anchor;

    return List<DateTime>.generate(
      widget.visibleDayCount,
      (index) => startDate.add(Duration(days: index)),
      growable: false,
    );
  }

  DateTime _weekStart(DateTime date, int firstDayOfWeek) {
    final weekday = date.weekday % 7;
    final diff = (weekday - firstDayOfWeek + 7) % 7;
    return DateTime(date.year, date.month, date.day - diff);
  }

  bool _isToday(DateTime date) {
    final now = DateTime.now();
    return date.year == now.year &&
        date.month == now.month &&
        date.day == now.day;
  }

  List<CalendarEvent> _timedEventsForDay(DateTime date) {
    final dayStart = DateTime(date.year, date.month, date.day);
    final dayEnd = dayStart.add(const Duration(days: 1));

    return widget.events.where((event) {
      if (event.isAllDay) {
        return false;
      }
      final start = event.startAt;
      final end = event.endAt ?? start;
      if (start == null) {
        return false;
      }
      return start.isBefore(dayEnd) && end!.isAfter(dayStart);
    }).toList();
  }

  List<CalendarEvent> get _allDayEvents =>
      widget.events.where((event) => event.isAllDay).toList(growable: false);

  @override
  void dispose() {
    _verticalController.dispose();
    _headerController.dispose();
    _allDayController.dispose();
    _gridController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final visibleDates = _visibleDates;
    final hourHeight = _hourHeight(context);
    final gutterWidth = _timeGutterWidth(context);

    return LayoutBuilder(
      builder: (context, constraints) {
        final viewportWidth = constraints.maxWidth;
        final dayAreaWidth = math.max(
          viewportWidth - gutterWidth,
          _minDayColumnWidth(context) * widget.visibleDayCount,
        );
        final dayColumnWidth = dayAreaWidth / widget.visibleDayCount;

        return GestureDetector(
          onHorizontalDragEnd: (details) {
            final velocity = details.primaryVelocity ?? 0;
            if (velocity > 350) {
              widget.onSwipe(-widget.visibleDayCount);
            } else if (velocity < -350) {
              widget.onSwipe(widget.visibleDayCount);
            }
          },
          child: Column(
            children: [
              Container(
                decoration: BoxDecoration(
                  color: colorScheme.surface,
                  border: Border(
                    bottom: BorderSide(
                      color: colorScheme.outlineVariant,
                      width: 0.6,
                    ),
                  ),
                ),
                child: SingleChildScrollView(
                  controller: _headerController,
                  scrollDirection: Axis.horizontal,
                  physics: const ClampingScrollPhysics(),
                  child: SizedBox(
                    width: gutterWidth + dayAreaWidth,
                    child: Row(
                      children: [
                        SizedBox(width: gutterWidth),
                        for (final date in visibleDates)
                          SizedBox(
                            width: dayColumnWidth,
                            child: _MultiDayHeaderCell(
                              date: date,
                              selectedDate: widget.selectedDate,
                              isToday: _isToday(date),
                              onTap: () => widget.onDaySelected(date),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              if (_allDayEvents.isNotEmpty)
                Container(
                  decoration: BoxDecoration(
                    color: colorScheme.surfaceContainerLow,
                    border: Border(
                      bottom: BorderSide(
                        color: colorScheme.outlineVariant,
                        width: 0.6,
                      ),
                    ),
                  ),
                  child: SingleChildScrollView(
                    controller: _allDayController,
                    scrollDirection: Axis.horizontal,
                    physics: const ClampingScrollPhysics(),
                    child: SizedBox(
                      width: gutterWidth + dayAreaWidth,
                      child: _MultiDayAllDayRow(
                        dates: visibleDates,
                        events: _allDayEvents,
                        timeGutterWidth: gutterWidth,
                        dayColumnWidth: dayColumnWidth,
                        onEventTap: widget.onEventTap,
                      ),
                    ),
                  ),
                ),
              Expanded(
                child: SingleChildScrollView(
                  controller: _verticalController,
                  physics: const AlwaysScrollableScrollPhysics(),
                  child: SingleChildScrollView(
                    controller: _gridController,
                    scrollDirection: Axis.horizontal,
                    physics: const ClampingScrollPhysics(),
                    child: SizedBox(
                      width: gutterWidth + dayAreaWidth,
                      child: SizedBox(
                        height: 24 * hourHeight,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: gutterWidth,
                              child: Stack(
                                children: List.generate(24, (hour) {
                                  return Positioned(
                                    top: hour * hourHeight - 7,
                                    left: 0,
                                    right: 8,
                                    child: Text(
                                      _formatHour(hour),
                                      textAlign: TextAlign.right,
                                      style: theme.textTheme.labelSmall
                                          ?.copyWith(
                                            color: colorScheme.onSurfaceVariant,
                                            fontSize: 10,
                                          ),
                                    ),
                                  );
                                }),
                              ),
                            ),
                            for (final date in visibleDates)
                              SizedBox(
                                width: dayColumnWidth,
                                child: _MultiDayTimelineColumn(
                                  date: date,
                                  selectedDate: widget.selectedDate,
                                  hourHeight: hourHeight,
                                  events: _timedEventsForDay(date),
                                  isToday: _isToday(date),
                                  onEventTap: widget.onEventTap,
                                  onCreateAtTime: widget.onCreateAtTime,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  String _formatHour(int hour) {
    if (hour == 0) {
      return '12 AM';
    }
    if (hour < 12) {
      return '$hour AM';
    }
    if (hour == 12) {
      return '12 PM';
    }
    return '${hour - 12} PM';
  }
}

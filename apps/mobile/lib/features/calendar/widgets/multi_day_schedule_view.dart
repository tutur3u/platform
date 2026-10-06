import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/all_day_layout.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';
import 'package:mobile/features/calendar/utils/event_layout.dart';
import 'package:mobile/features/calendar/utils/timed_event_geometry.dart';
import 'package:mobile/features/calendar/utils/working_location_icon.dart';
import 'package:mobile/features/calendar/widgets/current_time_indicator.dart';
import 'package:mobile/features/calendar/widgets/date_snap_scroll_physics.dart';
import 'package:mobile/l10n/l10n.dart';

part 'multi_day_schedule_components.dart';
part 'multi_day_schedule_scroll.dart';

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
  bool _allDayExpanded = false;
  late DateTime _windowStart;
  DateTime? _scrollSelection;
  double _dayWidth = 0;
  bool _positionPending = false;

  int get _bufferDays => math.max(7, widget.visibleDayCount * 2);
  int get _windowDays => _bufferDays * 2 + widget.visibleDayCount;

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
    _resetDateWindow();
    for (final controller in _horizontalControllers) {
      controller.addListener(() => _syncHorizontalScroll(controller));
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoScroll());
  }

  @override
  void didUpdateWidget(covariant MultiDayScheduleView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedDate != widget.selectedDate) {
      final fromScroll = widget.selectedDate == _scrollSelection;
      _scrollSelection = null;
      if (!fromScroll) {
        _resetDateWindow();
        _scheduleDatePosition();
      }
    }
    if (oldWidget.events != widget.events) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _gridController.hasClients) {
          _positionDates(_gridController.offset);
        }
      });
    }
    if (oldWidget.visibleDayCount != widget.visibleDayCount ||
        oldWidget.firstDayOfWeek != widget.firstDayOfWeek) {
      _resetDateWindow();
      _scheduleDatePosition();
    }
    if (oldWidget.visibleDayCount != widget.visibleDayCount ||
        oldWidget.alignToWeekStart != widget.alignToWeekStart ||
        (oldWidget.events.isEmpty && widget.events.isNotEmpty)) {
      _didAutoScroll = false;
      _allDayExpanded = false;
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
    final now = calendarNowInContext(context);
    final earliestEventHour = _visibleDates
        .expand(_timedEventsForDay)
        .map((event) => event.startAt?.hour)
        .whereType<int>()
        .fold<int?>(
          null,
          (earliest, hour) =>
              earliest == null || hour < earliest ? hour : earliest,
        );
    final targetHour = hasTodayInRange
        ? (now.hour - 1).clamp(0, 20)
        : ((earliestEventHour ?? 8) - 1).clamp(0, 20);
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
    return List<DateTime>.generate(
      _windowDays,
      (index) => _windowStart.add(Duration(days: index)),
      growable: false,
    );
  }

  DateTime _weekStart(DateTime date, int firstDayOfWeek) {
    final weekday = date.weekday % 7;
    final diff = (weekday - firstDayOfWeek + 7) % 7;
    return calendarDate(date.year, date.month, date.day - diff);
  }

  bool _isToday(DateTime date) {
    final now = calendarNowInContext(context);
    return date.year == now.year &&
        date.month == now.month &&
        date.day == now.day;
  }

  List<CalendarEvent> _timedEventsForDay(DateTime date) {
    final dayStart = calendarDate(date.year, date.month, date.day);
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
    final allDayEvents = _allDayEvents;
    final allDayLayout = calculateAllDayLayout(
      visibleDates: visibleDates,
      events: allDayEvents,
    );
    final hasCollapsedAllDayRows = allDayLayout.maxRow >= 2;
    final hourHeight = _hourHeight(context);
    final gutterWidth = _timeGutterWidth(context);

    return LayoutBuilder(
      builder: (context, constraints) {
        final viewportWidth = constraints.maxWidth;
        final viewportDayWidth = math.max(
          viewportWidth - gutterWidth,
          _minDayColumnWidth(context) * widget.visibleDayCount,
        );
        final dayColumnWidth = viewportDayWidth / widget.visibleDayCount;
        final dayAreaWidth = dayColumnWidth * _windowDays;
        if (_dayWidth != dayColumnWidth) {
          _dayWidth = dayColumnWidth;
          _scheduleDatePosition();
        }

        return NotificationListener<ScrollEndNotification>(
          onNotification: _settleDateScroll,
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
                child: Stack(
                  children: [
                    SingleChildScrollView(
                      controller: _headerController,
                      scrollDirection: Axis.horizontal,
                      physics: DateSnapScrollPhysics(dayWidth: dayColumnWidth),
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
                    Positioned(
                      left: 0,
                      top: 0,
                      bottom: 0,
                      child: Container(
                        width: gutterWidth,
                        color: colorScheme.surface,
                      ),
                    ),
                  ],
                ),
              ),
              if (allDayLayout.spans.isNotEmpty)
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Stack(
                        children: [
                          SingleChildScrollView(
                            controller: _allDayController,
                            scrollDirection: Axis.horizontal,
                            physics: DateSnapScrollPhysics(
                              dayWidth: dayColumnWidth,
                            ),
                            child: SizedBox(
                              width: gutterWidth + dayAreaWidth,
                              child: AnimatedBuilder(
                                animation: _allDayController,
                                builder: (context, _) => _MultiDayAllDayRow(
                                  layout: allDayLayout,
                                  timeGutterWidth: gutterWidth,
                                  dayColumnWidth: dayColumnWidth,
                                  viewportStart:
                                      (_allDayController.hasClients
                                          ? _allDayController.offset
                                          : 0) +
                                      gutterWidth,
                                  viewportWidth: viewportWidth - gutterWidth,
                                  maxVisibleRows: _allDayExpanded ? null : 2,
                                  onEventTap: widget.onEventTap,
                                ),
                              ),
                            ),
                          ),
                          Positioned(
                            left: 0,
                            top: 0,
                            bottom: 0,
                            child: Container(
                              width: gutterWidth,
                              color: colorScheme.surfaceContainerLow,
                              padding: const EdgeInsets.only(top: 10, right: 8),
                              child: Text(
                                context.l10n.calendarAllDay,
                                maxLines: 1,
                                softWrap: false,
                                overflow: TextOverflow.ellipsis,
                                textAlign: TextAlign.right,
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: colorScheme.onSurfaceVariant,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (hasCollapsedAllDayRows)
                        TextButton.icon(
                          onPressed: () => setState(
                            () => _allDayExpanded = !_allDayExpanded,
                          ),
                          icon: Icon(
                            _allDayExpanded
                                ? Icons.expand_less_rounded
                                : Icons.expand_more_rounded,
                            size: 18,
                          ),
                          label: Text(
                            _allDayExpanded
                                ? context.l10n.commonShowLess
                                : context.l10n.commonShowMore,
                          ),
                        ),
                    ],
                  ),
                ),
              Expanded(
                child: SingleChildScrollView(
                  controller: _verticalController,
                  physics: const AlwaysScrollableScrollPhysics(),
                  child: Stack(
                    children: [
                      SingleChildScrollView(
                        controller: _gridController,
                        scrollDirection: Axis.horizontal,
                        physics: DateSnapScrollPhysics(
                          dayWidth: dayColumnWidth,
                        ),
                        child: SizedBox(
                          width: gutterWidth + dayAreaWidth,
                          child: SizedBox(
                            height: 24 * hourHeight,
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                SizedBox(width: gutterWidth),
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
                      Positioned(
                        left: 0,
                        top: 0,
                        bottom: 0,
                        child: Container(
                          width: gutterWidth,
                          color: colorScheme.surface,
                          child: Stack(
                            children: List.generate(
                              24,
                              (hour) => Positioned(
                                top: hour * hourHeight - 7,
                                left: 0,
                                right: 8,
                                child: Text(
                                  _formatHour(hour),
                                  textAlign: TextAlign.right,
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    color: colorScheme.onSurfaceVariant,
                                    fontSize: 10,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _shiftDateWindow(int shift) {
    setState(() {
      _windowStart = _windowStart.add(Duration(days: shift));
    });
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

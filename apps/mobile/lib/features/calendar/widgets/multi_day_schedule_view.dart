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

class _MultiDayHeaderCell extends StatelessWidget {
  const _MultiDayHeaderCell({
    required this.date,
    required this.selectedDate,
    required this.isToday,
    required this.onTap,
  });

  final DateTime date;
  final DateTime selectedDate;
  final bool isToday;
  final VoidCallback onTap;

  bool get _isSelected =>
      date.year == selectedDate.year &&
      date.month == selectedDate.month &&
      date.day == selectedDate.day;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final weekdayLabel = DateFormat.E().format(date).toUpperCase();
    final monthLabel = DateFormat.MMM().format(date).toUpperCase();

    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 10, 4, 10),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOutCubic,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: _isSelected
                  ? colorScheme.primary
                  : isToday
                  ? colorScheme.primary.withValues(alpha: 0.10)
                  : colorScheme.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: _isSelected
                    ? colorScheme.primary
                    : isToday
                    ? colorScheme.primary.withValues(alpha: 0.45)
                    : colorScheme.outlineVariant.withValues(alpha: 0.55),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  weekdayLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: _isSelected
                        ? colorScheme.onPrimary.withValues(alpha: 0.82)
                        : isToday
                        ? colorScheme.primary
                        : colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Text(
                      '${date.day}',
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: _isSelected
                            ? colorScheme.onPrimary
                            : colorScheme.onSurface,
                        fontWeight: FontWeight.w800,
                        height: 1,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        monthLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: _isSelected
                              ? colorScheme.onPrimary.withValues(alpha: 0.72)
                              : colorScheme.onSurfaceVariant,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MultiDayTimelineColumn extends StatelessWidget {
  const _MultiDayTimelineColumn({
    required this.date,
    required this.selectedDate,
    required this.hourHeight,
    required this.events,
    required this.isToday,
    required this.onEventTap,
    required this.onCreateAtTime,
  });

  final DateTime date;
  final DateTime selectedDate;
  final double hourHeight;
  final List<CalendarEvent> events;
  final bool isToday;
  final ValueChanged<CalendarEvent> onEventTap;
  final ValueChanged<DateTime> onCreateAtTime;

  bool get _isSelected =>
      date.year == selectedDate.year &&
      date.month == selectedDate.month &&
      date.day == selectedDate.day;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final layouts = calculateEventLayout(events);

    return GestureDetector(
      onLongPressStart: (details) {
        final localY = details.localPosition.dy;
        final minutes = (localY / hourHeight * 60).round();
        final roundedMinutes = (minutes ~/ 15) * 15;
        final hour = roundedMinutes ~/ 60;
        final minute = roundedMinutes % 60;
        onCreateAtTime(
          DateTime(
            date.year,
            date.month,
            date.day,
            hour.clamp(0, 23),
            minute,
          ),
        );
      },
      child: Container(
        decoration: BoxDecoration(
          color: _isSelected
              ? colorScheme.primary.withValues(alpha: 0.035)
              : Colors.transparent,
          border: Border(
            left: BorderSide(color: colorScheme.outlineVariant, width: 0.6),
            right: BorderSide(
              color: colorScheme.outlineVariant.withValues(alpha: 0.45),
              width: 0.2,
            ),
          ),
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth;

            return Stack(
              children: [
                for (var hour = 0; hour < 24; hour++)
                  Positioned(
                    top: hour * hourHeight,
                    left: 0,
                    right: 0,
                    child: Container(
                      height: 0.6,
                      color: colorScheme.outlineVariant.withValues(alpha: 0.8),
                    ),
                  ),
                for (final layout in layouts)
                  _MultiDayEventCard(
                    layoutInfo: layout,
                    hourHeight: hourHeight,
                    columnWidth: width,
                    onTap: () => onEventTap(layout.event),
                  ),
                if (isToday) CurrentTimeIndicator(hourHeight: hourHeight),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _MultiDayEventCard extends StatelessWidget {
  const _MultiDayEventCard({
    required this.layoutInfo,
    required this.hourHeight,
    required this.columnWidth,
    required this.onTap,
  });

  final EventLayoutInfo layoutInfo;
  final double hourHeight;
  final double columnWidth;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final event = layoutInfo.event;
    final start = event.startAt ?? DateTime.now();
    final end = event.endAt ?? start.add(const Duration(minutes: 30));
    final startMinutes = start.hour * 60 + start.minute;
    final durationMinutes = end.difference(start).inMinutes.clamp(15, 1440);
    final top = (startMinutes / 60) * hourHeight;
    final height = (durationMinutes / 60) * hourHeight;
    final subColumnWidth = columnWidth / layoutInfo.totalColumns;
    final left = layoutInfo.column * subColumnWidth;

    return Positioned(
      top: top,
      left: left,
      width: subColumnWidth - 3,
      height: height.clamp(22, double.infinity),
      child: _MultiDayEventCardSurface(
        event: event,
        height: height,
        onTap: onTap,
      ),
    );
  }
}

class _MultiDayEventCardSurface extends StatelessWidget {
  const _MultiDayEventCardSurface({
    required this.event,
    required this.height,
    required this.onTap,
  });

  final CalendarEvent event;
  final double height;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final accentColor = EventColors.fromString(event.color);
    final foregroundColor = EventColors.bright(event.color);
    final backgroundColor = EventColors.background(event.color);
    final start = event.startAt;
    final end = event.endAt ?? start;
    final showTime = start != null && end != null && height >= 48;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          margin: const EdgeInsets.only(right: 2, bottom: 2),
          padding: const EdgeInsets.fromLTRB(8, 6, 6, 6),
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(10),
            border: Border(
              left: BorderSide(color: accentColor, width: 3),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.03),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                event.title ?? '',
                maxLines: showTime ? 2 : 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: foregroundColor,
                  fontWeight: FontWeight.w700,
                  height: 1.1,
                ),
              ),
              if (showTime) ...[
                const SizedBox(height: 4),
                Text(
                  '${_formatTime(start)} - ${_formatTime(end)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: foregroundColor.withValues(alpha: 0.78),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _formatTime(DateTime value) {
    final hour = value.hour;
    final minute = value.minute.toString().padLeft(2, '0');
    final period = hour >= 12 ? 'PM' : 'AM';
    final normalizedHour = hour == 0
        ? 12
        : hour > 12
        ? hour - 12
        : hour;
    return '$normalizedHour:$minute $period';
  }
}

class _MultiDayAllDayRow extends StatelessWidget {
  const _MultiDayAllDayRow({
    required this.dates,
    required this.events,
    required this.timeGutterWidth,
    required this.dayColumnWidth,
    required this.onEventTap,
  });

  final List<DateTime> dates;
  final List<CalendarEvent> events;
  final double timeGutterWidth;
  final double dayColumnWidth;
  final ValueChanged<CalendarEvent> onEventTap;

  static const _rowHeight = 22.0;
  static const _rowGap = 4.0;

  @override
  Widget build(BuildContext context) {
    final layout = calculateAllDayLayout(
      visibleDates: dates,
      events: events,
    );
    if (layout.spans.isEmpty) {
      return const SizedBox.shrink();
    }

    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final rows = layout.maxRow + 1;
    final height = rows * _rowHeight + (math.max(rows - 1, 0) * _rowGap) + 14;

    return SizedBox(
      height: height,
      child: Stack(
        children: [
          Positioned(
            left: 0,
            top: 10,
            width: timeGutterWidth - 8,
            child: Text(
              context.l10n.calendarAllDay,
              textAlign: TextAlign.right,
              style: theme.textTheme.labelSmall?.copyWith(
                color: colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          for (final span in layout.spans)
            Positioned(
              left: timeGutterWidth + span.startIndex * dayColumnWidth + 4,
              top: span.row * (_rowHeight + _rowGap) + 6,
              width: span.span * dayColumnWidth - 8,
              height: _rowHeight,
              child: _MultiDayAllDayChip(
                event: span.event,
                onTap: () => onEventTap(span.event),
              ),
            ),
        ],
      ),
    );
  }
}

class _MultiDayAllDayChip extends StatelessWidget {
  const _MultiDayAllDayChip({
    required this.event,
    required this.onTap,
  });

  final CalendarEvent event;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final accentColor = EventColors.fromString(event.color);
    final foregroundColor = EventColors.bright(event.color);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            color: EventColors.background(event.color),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: accentColor.withValues(alpha: 0.22),
            ),
          ),
          alignment: Alignment.centerLeft,
          child: Text(
            event.title ?? '',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: foregroundColor,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}

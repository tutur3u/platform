import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/all_day_layout.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';
import 'package:mobile/features/calendar/utils/event_layout.dart';
import 'package:mobile/features/calendar/widgets/current_time_indicator.dart';

/// 3-day time grid view showing 3 consecutive day columns side by side.
///
/// Similar to the day schedule view but displays 3 days at once, giving
/// context without the crowding of a full 7-day week view. Swipe left/right
/// to shift by 3 days.
class ThreeDayView extends StatefulWidget {
  const ThreeDayView({
    required this.selectedDate,
    required this.events,
    required this.onEventTap,
    required this.onCreateAtTime,
    required this.onDaySelected,
    required this.onSwipe,
    super.key,
  });

  final DateTime selectedDate;
  final List<CalendarEvent> events;
  final ValueChanged<CalendarEvent> onEventTap;
  final ValueChanged<DateTime> onCreateAtTime;
  final ValueChanged<DateTime> onDaySelected;

  /// Called with -3 (swipe right) or +3 (swipe left) to navigate.
  final ValueChanged<int> onSwipe;

  @override
  State<ThreeDayView> createState() => _ThreeDayViewState();
}

class _ThreeDayViewState extends State<ThreeDayView> {
  final ScrollController _scrollController = ScrollController();
  static const _hourHeight = 50.0;
  static const _timeGutterWidth = 42.0;
  bool _didAutoScroll = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoScroll());
  }

  @override
  void didUpdateWidget(ThreeDayView oldWidget) {
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
    final targetHour = _isToday ? (now.hour - 1).clamp(0, 20) : 8;
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

  /// The three dates to display, starting from selectedDate.
  List<DateTime> get _dates {
    final base = DateTime(
      widget.selectedDate.year,
      widget.selectedDate.month,
      widget.selectedDate.day,
    );
    return [
      base,
      base.add(const Duration(days: 1)),
      base.add(const Duration(days: 2)),
    ];
  }

  List<CalendarEvent> _eventsForDay(DateTime date) {
    final dayStart = DateTime(date.year, date.month, date.day);
    final dayEnd = dayStart.add(const Duration(days: 1));
    return widget.events.where((e) {
      final start = e.startAt;
      final end = e.endAt ?? start;
      if (start == null) return false;
      return start.isBefore(dayEnd) && end!.isAfter(dayStart);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final dates = _dates;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final dayFormat = DateFormat.E(); // e.g. "Mon"

    return GestureDetector(
      onHorizontalDragEnd: (details) {
        final velocity = details.primaryVelocity ?? 0;
        if (velocity > 300) {
          widget.onSwipe(-3);
        } else if (velocity < -300) {
          widget.onSwipe(3);
        }
      },
      child: Column(
        children: [
          // Day headers.
          Container(
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: colorScheme.outlineVariant,
                  width: 0.5,
                ),
              ),
            ),
            child: Row(
              children: [
                // Time gutter spacer.
                const SizedBox(width: _timeGutterWidth),
                // Day columns.
                ...dates.map((date) {
                  final isToday = date == today;
                  final isSelected =
                      date.year == widget.selectedDate.year &&
                      date.month == widget.selectedDate.month &&
                      date.day == widget.selectedDate.day;

                  return Expanded(
                    child: GestureDetector(
                      onTap: () => widget.onDaySelected(date),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Column(
                          children: [
                            Text(
                              dayFormat.format(date),
                              style: textTheme.labelSmall?.copyWith(
                                color: isToday
                                    ? colorScheme.primary
                                    : colorScheme.onSurfaceVariant,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Container(
                              width: 28,
                              height: 28,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: isSelected ? colorScheme.primary : null,
                                border: isToday && !isSelected
                                    ? Border.all(color: colorScheme.primary)
                                    : null,
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                '${date.day}',
                                style: textTheme.bodySmall?.copyWith(
                                  color: isSelected
                                      ? colorScheme.onPrimary
                                      : isToday
                                      ? colorScheme.primary
                                      : null,
                                  fontWeight: isToday || isSelected
                                      ? FontWeight.w600
                                      : null,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }),
              ],
            ),
          ),
          // All-day events row.
          _AllDayRow(
            dates: dates,
            events: widget.events,
            timeGutterWidth: _timeGutterWidth,
            onEventTap: widget.onEventTap,
          ),
          // Scrollable time grid.
          Expanded(
            child: SingleChildScrollView(
              controller: _scrollController,
              child: SizedBox(
                height: 24 * _hourHeight,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Time gutter.
                    SizedBox(
                      width: _timeGutterWidth,
                      height: 24 * _hourHeight,
                      child: Stack(
                        children: List.generate(24, (hour) {
                          return Positioned(
                            top: hour * _hourHeight,
                            left: 0,
                            right: 4,
                            child: Text(
                              _formatHour(hour),
                              textAlign: TextAlign.right,
                              style: textTheme.labelSmall?.copyWith(
                                fontSize: 9,
                                color: colorScheme.onSurfaceVariant,
                              ),
                            ),
                          );
                        }),
                      ),
                    ),
                    // Day columns.
                    ...dates.map((date) {
                      final dayEvents = _eventsForDay(
                        date,
                      ).where((e) => !e.isAllDay).toList();
                      final layouts = calculateEventLayout(dayEvents);
                      final dateIsToday = date == today;

                      return Expanded(
                        child: _DayColumn(
                          date: date,
                          layouts: layouts,
                          hourHeight: _hourHeight,
                          isToday: dateIsToday,
                          onEventTap: widget.onEventTap,
                          onLongPress: widget.onCreateAtTime,
                        ),
                      );
                    }),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatHour(int hour) {
    if (hour == 0) return '12a';
    if (hour < 12) return '${hour}a';
    if (hour == 12) return '12p';
    return '${hour - 12}p';
  }
}

/// A single day column within the 3-day grid.
///
/// Uses [LayoutBuilder] to get actual pixel width so overlapping events
/// can be precisely positioned in sub-columns.
class _DayColumn extends StatelessWidget {
  const _DayColumn({
    required this.date,
    required this.layouts,
    required this.hourHeight,
    required this.isToday,
    required this.onEventTap,
    required this.onLongPress,
  });

  final DateTime date;
  final List<EventLayoutInfo> layouts;
  final double hourHeight;
  final bool isToday;
  final ValueChanged<CalendarEvent> onEventTap;
  final ValueChanged<DateTime> onLongPress;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return GestureDetector(
      onLongPressStart: (details) {
        final localY = details.localPosition.dy;
        final minutes = (localY / hourHeight * 60).round();
        final roundedMinutes = (minutes ~/ 15) * 15;
        final hour = roundedMinutes ~/ 60;
        final minute = roundedMinutes % 60;
        final eventTime = DateTime(
          date.year,
          date.month,
          date.day,
          hour.clamp(0, 23),
          minute,
        );
        onLongPress(eventTime);
      },
      child: Container(
        height: 24 * hourHeight,
        decoration: BoxDecoration(
          border: Border(
            left: BorderSide(
              color: colorScheme.outlineVariant,
              width: 0.5,
            ),
          ),
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final colWidth = constraints.maxWidth;
            return Stack(
              children: [
                // Hour grid lines.
                ...List.generate(24, (hour) {
                  return Positioned(
                    top: hour * hourHeight,
                    left: 0,
                    right: 0,
                    child: Container(
                      height: 0.5,
                      color: colorScheme.outlineVariant,
                    ),
                  );
                }),
                // Event cards.
                ...layouts.map((layout) {
                  final event = layout.event;
                  final start = event.startAt ?? DateTime.now();
                  final end =
                      event.endAt ?? start.add(const Duration(minutes: 30));
                  final startMin = start.hour * 60 + start.minute;
                  final durMin = end
                      .difference(start)
                      .inMinutes
                      .clamp(15, 1440);
                  final top = (startMin / 60) * hourHeight;
                  final height = (durMin / 60) * hourHeight;
                  final subColW = colWidth / layout.totalColumns;
                  final left = layout.column * subColW;

                  return _CompactEventCard(
                    event: event,
                    top: top,
                    left: left,
                    width: subColW - 1,
                    height: height.clamp(16, double.infinity),
                    onTap: () => onEventTap(event),
                  );
                }),
                // Current time indicator.
                if (isToday) CurrentTimeIndicator(hourHeight: hourHeight),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Compact event card positioned within a day column.
class _CompactEventCard extends StatelessWidget {
  const _CompactEventCard({
    required this.event,
    required this.top,
    required this.left,
    required this.width,
    required this.height,
    required this.onTap,
  });

  final CalendarEvent event;
  final double top;
  final double left;
  final double width;
  final double height;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final accentColor = EventColors.fromString(event.color);
    final titleColor = EventColors.bright(event.color);

    return Positioned(
      top: top,
      left: left,
      width: width,
      height: height,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.only(right: 1, bottom: 1),
          decoration: BoxDecoration(
            color: EventColors.background(event.color),
            borderRadius: BorderRadius.circular(4),
            border: Border(
              left: BorderSide(color: accentColor, width: 2),
            ),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 1),
          child: Text(
            event.title ?? '',
            maxLines: height > 30 ? 2 : 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              color: titleColor,
            ),
          ),
        ),
      ),
    );
  }
}

/// Displays all-day events as continuous spanning bars above the time grid.
///
/// Uses [calculateAllDayLayout] to handle multi-day spans and merge
/// same-title adjacent events into continuous bars.
class _AllDayRow extends StatelessWidget {
  const _AllDayRow({
    required this.dates,
    required this.events,
    required this.timeGutterWidth,
    required this.onEventTap,
  });

  final List<DateTime> dates;
  final List<CalendarEvent> events;
  final double timeGutterWidth;
  final ValueChanged<CalendarEvent> onEventTap;

  static const _rowHeight = 18.0;
  static const _rowGap = 2.0;

  @override
  Widget build(BuildContext context) {
    final layout = calculateAllDayLayout(
      visibleDates: dates,
      events: events,
    );
    if (layout.spans.isEmpty) return const SizedBox.shrink();

    final colorScheme = Theme.of(context).colorScheme;
    final totalRows = layout.maxRow + 1;
    final height = totalRows * (_rowHeight + _rowGap) + 8;

    return Container(
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLow,
        border: Border(
          bottom: BorderSide(
            color: colorScheme.outlineVariant,
            width: 0.5,
          ),
        ),
      ),
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: SizedBox(
        height: height,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final gridWidth = constraints.maxWidth - timeGutterWidth;
            final colWidth = gridWidth / dates.length;

            return Stack(
              children: layout.spans.map((span) {
                final left = timeGutterWidth + span.startIndex * colWidth + 1;
                final width = span.span * colWidth - 2;
                final top = span.row * (_rowHeight + _rowGap);
                final color = EventColors.fromString(span.event.color);

                return Positioned(
                  left: left,
                  top: top,
                  width: width,
                  height: _rowHeight,
                  child: GestureDetector(
                    onTap: () => onEventTap(span.event),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(
                        color: EventColors.background(span.event.color),
                        borderRadius: BorderRadius.circular(3),
                        border: Border(
                          left: BorderSide(color: color, width: 2),
                        ),
                      ),
                      alignment: Alignment.centerLeft,
                      child: Text(
                        span.event.title ?? '',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                          color: EventColors.bright(span.event.color),
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            );
          },
        ),
      ),
    );
  }
}

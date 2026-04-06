import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class YearView extends StatelessWidget {
  const YearView({
    required this.selectedDate,
    required this.focusedMonth,
    required this.events,
    required this.firstDayOfWeek,
    required this.onDaySelected,
    required this.onYearChanged,
    super.key,
  });

  final DateTime selectedDate;
  final DateTime focusedMonth;
  final List<CalendarEvent> events;
  final int firstDayOfWeek;
  final ValueChanged<DateTime> onDaySelected;
  final ValueChanged<DateTime> onYearChanged;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final displayYear = focusedMonth.year;
    final eventColorsByDay = _buildEventColorsByDay(events);
    final isCompact = context.isCompact;

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              children: [
                shad.IconButton.ghost(
                  onPressed: () => onYearChanged(
                    DateTime(displayYear - 1, focusedMonth.month),
                  ),
                  icon: const Icon(Icons.chevron_left_rounded),
                ),
                Expanded(
                  child: Text(
                    '$displayYear',
                    textAlign: TextAlign.center,
                    style: theme.typography.h4.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                shad.IconButton.ghost(
                  onPressed: () => onYearChanged(
                    DateTime(displayYear + 1, focusedMonth.month),
                  ),
                  icon: const Icon(Icons.chevron_right_rounded),
                ),
              ],
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 96),
          sliver: isCompact
              ? SliverList(
                  delegate: SliverChildBuilderDelegate((context, index) {
                    return Padding(
                      padding: EdgeInsets.only(bottom: index == 11 ? 0 : 12),
                      child: _YearMonthCard(
                        month: DateTime(displayYear, index + 1),
                        selectedDate: selectedDate,
                        firstDayOfWeek: firstDayOfWeek,
                        eventColorsByDay: eventColorsByDay,
                        onDaySelected: onDaySelected,
                      ),
                    );
                  }, childCount: 12),
                )
              : SliverGrid(
                  delegate: SliverChildBuilderDelegate((context, index) {
                    return _YearMonthCard(
                      month: DateTime(displayYear, index + 1),
                      selectedDate: selectedDate,
                      firstDayOfWeek: firstDayOfWeek,
                      eventColorsByDay: eventColorsByDay,
                      onDaySelected: onDaySelected,
                    );
                  }, childCount: 12),
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 360,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    mainAxisExtent: 286,
                  ),
                ),
        ),
      ],
    );
  }

  Map<String, List<Color>> _buildEventColorsByDay(List<CalendarEvent> events) {
    final colorsByDay = <String, List<Color>>{};

    for (final event in events) {
      final start = event.startAt;
      if (start == null) {
        continue;
      }

      final startDay = DateTime(start.year, start.month, start.day);
      final rawEnd = event.endAt ?? start;
      final endDayExclusive = event.isAllDay
          ? DateTime(rawEnd.year, rawEnd.month, rawEnd.day)
          : DateTime(rawEnd.year, rawEnd.month, rawEnd.day + 1);
      final lastDay = endDayExclusive.isAfter(startDay)
          ? endDayExclusive.subtract(const Duration(days: 1))
          : startDay;
      final eventColor = _parseEventColor(event.color);

      for (
        var current = startDay;
        !current.isAfter(lastDay);
        current = current.add(const Duration(days: 1))
      ) {
        final key = _dateKey(current);
        final bucket = colorsByDay.putIfAbsent(key, () => <Color>[]);
        if (bucket.length < 2) {
          bucket.add(eventColor);
        }
      }
    }

    return colorsByDay;
  }

  Color _parseEventColor(String? rawColor) {
    final cleaned = rawColor?.replaceFirst('#', '').trim();
    if (cleaned == null || (cleaned.length != 6 && cleaned.length != 8)) {
      return const Color(0xFF0F5FB7);
    }

    final value = int.tryParse(
      cleaned.length == 6 ? 'FF$cleaned' : cleaned,
      radix: 16,
    );
    return value == null ? const Color(0xFF0F5FB7) : Color(value);
  }

  String _dateKey(DateTime date) =>
      '${date.year}-${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';
}

class _YearMonthCard extends StatelessWidget {
  const _YearMonthCard({
    required this.month,
    required this.selectedDate,
    required this.firstDayOfWeek,
    required this.eventColorsByDay,
    required this.onDaySelected,
  });

  final DateTime month;
  final DateTime selectedDate;
  final int firstDayOfWeek;
  final Map<String, List<Color>> eventColorsByDay;
  final ValueChanged<DateTime> onDaySelected;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final firstOfMonth = DateTime(month.year, month.month);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final startWeekday = (firstOfMonth.weekday % 7 - firstDayOfWeek + 7) % 7;
    final totalCells = ((startWeekday + daysInMonth + 6) ~/ 7) * 7;
    final weekCount = totalCells ~/ 7;
    final weekdayLabels = List.generate(7, (index) {
      final reference = DateTime(2024, 1, 7 + ((firstDayOfWeek + index) % 7));
      final shortLabel = DateFormat.E().format(reference);
      return shortLabel.isEmpty ? '' : shortLabel.substring(0, 1).toUpperCase();
    });

    return Container(
      padding: EdgeInsets.all(context.isCompact ? 14 : 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: theme.colorScheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            DateFormat.MMMM().format(month),
            style: theme.typography.large.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          Row(
            children: weekdayLabels
                .map(
                  (label) => Expanded(
                    child: Center(
                      child: Text(
                        label,
                        style: theme.typography.xSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                          fontWeight: FontWeight.w700,
                          height: 1,
                        ),
                      ),
                    ),
                  ),
                )
                .toList(growable: false),
          ),
          const SizedBox(height: 8),
          for (var weekIndex = 0; weekIndex < weekCount; weekIndex++) ...[
            Row(
              children: List.generate(7, (weekdayIndex) {
                final cellIndex = weekIndex * 7 + weekdayIndex;
                final day = cellIndex - startWeekday + 1;
                final inMonth = day >= 1 && day <= daysInMonth;
                final date = inMonth
                    ? DateTime(month.year, month.month, day)
                    : null;

                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(2),
                    child: _YearDayCell(
                      date: date,
                      selectedDate: selectedDate,
                      eventColors: date == null
                          ? const []
                          : eventColorsByDay[_dateKey(date)] ?? const [],
                      onTap: date == null ? null : () => onDaySelected(date),
                    ),
                  ),
                );
              }),
            ),
            if (weekIndex != weekCount - 1) const SizedBox(height: 4),
          ],
        ],
      ),
    );
  }

  String _dateKey(DateTime date) =>
      '${date.year}-${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';
}

class _YearDayCell extends StatelessWidget {
  const _YearDayCell({
    required this.date,
    required this.selectedDate,
    required this.eventColors,
    required this.onTap,
  });

  final DateTime? date;
  final DateTime selectedDate;
  final List<Color> eventColors;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    if (date == null) {
      return const SizedBox(height: 30);
    }

    final theme = shad.Theme.of(context);
    final now = DateTime.now();
    final isToday =
        date!.year == now.year &&
        date!.month == now.month &&
        date!.day == now.day;
    final isSelected =
        date!.year == selectedDate.year &&
        date!.month == selectedDate.month &&
        date!.day == selectedDate.day;
    final backgroundColor = isSelected
        ? theme.colorScheme.primary
        : isToday
        ? theme.colorScheme.primary.withValues(alpha: 0.10)
        : Colors.transparent;
    final textColor = isSelected
        ? theme.colorScheme.primaryForeground
        : theme.colorScheme.foreground;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          height: 30,
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(12),
            border: isToday && !isSelected
                ? Border.all(
                    color: theme.colorScheme.primary.withValues(alpha: 0.35),
                  )
                : null,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                '${date!.day}',
                style: TextStyle(
                  fontSize: 12,
                  height: 1,
                  color: textColor,
                  fontWeight: isSelected || isToday
                      ? FontWeight.w800
                      : FontWeight.w600,
                ),
              ),
              if (eventColors.isNotEmpty) ...[
                const SizedBox(height: 3),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: eventColors
                      .take(2)
                      .map(
                        (color) => Container(
                          width: 4,
                          height: 4,
                          margin: const EdgeInsets.symmetric(horizontal: 1),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? theme.colorScheme.primaryForeground
                                      .withValues(alpha: 0.92)
                                : color,
                            shape: BoxShape.circle,
                          ),
                        ),
                      )
                      .toList(growable: false),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

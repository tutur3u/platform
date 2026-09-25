part of 'multi_day_schedule_view.dart';

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
                Wrap(
                  spacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
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
                    Text(
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
          DateTime(date.year, date.month, date.day, hour.clamp(0, 23), minute),
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
    final height = math.max(
      (durationMinutes / 60) * hourHeight,
      MediaQuery.textScalerOf(
                context,
              ).scale(Theme.of(context).textTheme.labelMedium?.fontSize ?? 14) *
              1.1 +
          16,
    );
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
    final lineHeight =
        MediaQuery.textScalerOf(
          context,
        ).scale(Theme.of(context).textTheme.labelMedium?.fontSize ?? 14) *
        1.1;
    final showTime =
        start != null && end != null && height >= lineHeight * 3 + 20;
    final verticalPadding = height < 36 ? 2.0 : 6.0;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          margin: const EdgeInsets.only(right: 2, bottom: 2),
          padding: EdgeInsets.fromLTRB(8, verticalPadding, 6, verticalPadding),
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(10),
            border: Border(left: BorderSide(color: accentColor, width: 3)),
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
    required this.layout,
    required this.timeGutterWidth,
    required this.dayColumnWidth,
    required this.maxVisibleRows,
    required this.onEventTap,
  });

  final AllDayLayoutResult layout;
  final double timeGutterWidth;
  final double dayColumnWidth;
  final int? maxVisibleRows;
  final ValueChanged<CalendarEvent> onEventTap;

  static const _rowHeight = 22.0;
  static const _rowGap = 4.0;

  @override
  Widget build(BuildContext context) {
    if (layout.spans.isEmpty) {
      return const SizedBox.shrink();
    }

    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final rows = math.min(
      layout.maxRow + 1,
      maxVisibleRows ?? layout.maxRow + 1,
    );
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
          for (final span in layout.spans.where((span) => span.row < rows))
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
  const _MultiDayAllDayChip({required this.event, required this.onTap});

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
            border: Border.all(color: accentColor.withValues(alpha: 0.22)),
          ),
          alignment: Alignment.centerLeft,
          child: Row(
            children: [
              if (event.workingLocationKind case final kind?) ...[
                Icon(
                  workingLocationIcon(kind),
                  size: 14,
                  color: foregroundColor,
                ),
                const SizedBox(width: 4),
              ],
              Expanded(
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
            ],
          ),
        ),
      ),
    );
  }
}

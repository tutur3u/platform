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
              color: isToday
                  ? colorScheme.primary
                  : colorScheme.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: isToday
                    ? colorScheme.primary
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
                    color: isToday
                        ? colorScheme.onPrimary.withValues(alpha: 0.82)
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
                        color: isToday
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
                        color: isToday
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

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final minimumHeight = timedEventMinimumHeight(
      hourHeight,
      MediaQuery.textScalerOf(
                context,
              ).scale(Theme.of(context).textTheme.labelMedium?.fontSize ?? 14) *
              1.1 +
          16,
    );
    final layouts = calculateEventLayout(
      events,
      minimumDuration: timedEventMinimumDuration(hourHeight, minimumHeight),
    );

    return GestureDetector(
      onLongPressStart: (details) {
        final localY = details.localPosition.dy;
        final minutes = (localY / hourHeight * 60).round();
        final roundedMinutes = (minutes ~/ 15) * 15;
        final hour = roundedMinutes ~/ 60;
        final minute = roundedMinutes % 60;
        onCreateAtTime(
          calendarDate(
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
          color: isToday
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
    final startMinutes = timedEventStartMinutes(start);
    final durationMinutes = timedEventDurationMinutes(start, end);
    final top = (startMinutes / 60) * hourHeight;
    final naturalHeight = math.max(
      (durationMinutes / 60) * hourHeight,
      timedEventMinimumHeight(
        hourHeight,
        MediaQuery.textScalerOf(context).scale(
                  Theme.of(context).textTheme.labelMedium?.fontSize ?? 14,
                ) *
                1.1 +
            16,
      ),
    );
    final height = layoutInfo.paintDuration == null
        ? naturalHeight
        : layoutInfo.paintDuration!.inMicroseconds.clamp(
                0,
                Duration.microsecondsPerDay,
              ) /
              Duration.microsecondsPerHour *
              hourHeight;
    final subColumnWidth = columnWidth / layoutInfo.totalColumns;
    final left = layoutInfo.column * subColumnWidth;

    return Positioned(
      top: top,
      left: left,
      width: subColumnWidth - 3,
      height: height,
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
    final accentColor = EventColors.inContext(event, context).accent;
    final foregroundColor = EventColors.inContext(event, context).foreground;
    final backgroundColor = EventColors.inContext(event, context).background;
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

    return Semantics(
      button: true,
      label: start == null || end == null
          ? event.title ?? ''
          : '${event.title ?? ''}, ${_formatTime(start)} – ${_formatTime(end)}',
      onTap: onTap,
      excludeSemantics: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: Container(
            margin: const EdgeInsets.only(right: 2, bottom: 2),
            padding: EdgeInsets.fromLTRB(
              8,
              verticalPadding,
              6,
              verticalPadding,
            ),
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
                          color: foregroundColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
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

class _MultiDayAllDayRow extends StatefulWidget {
  const _MultiDayAllDayRow({
    required this.layout,
    required this.scope,
    required this.timeGutterWidth,
    required this.dayColumnWidth,
    required this.maxVisibleRows,
    required this.viewportStart,
    required this.viewportWidth,
    required this.availableHeight,
    required this.onEventTap,
  });

  final AllDayLayoutResult layout;
  final Object? scope;
  final double timeGutterWidth;
  final double dayColumnWidth;
  final int? maxVisibleRows;
  final double viewportStart;
  final double viewportWidth;
  final double availableHeight;
  final ValueChanged<CalendarEvent> onEventTap;

  static const _rowHeight = 22.0;
  static const _rowGap = 4.0;

  static double rowHeight(BuildContext context) => math.max(
    _rowHeight,
    MediaQuery.textScalerOf(
              context,
            ).scale(Theme.of(context).textTheme.labelSmall?.fontSize ?? 12) *
            1.2 +
        8,
  );

  static double heightForRows(BuildContext context, int rows) =>
      rows * rowHeight(context) + math.max(rows - 1, 0) * _rowGap + 14;

  @override
  State<_MultiDayAllDayRow> createState() => _MultiDayAllDayRowState();
}

class _MultiDayAllDayRowState extends State<_MultiDayAllDayRow> {
  Map<Object, double> _targets = {};
  Map<Object, double> _paintedTops = {};
  Map<Object, double> _previousTops = {};
  double? _lastHeight;
  double _startHeight = 0;

  Map<CalendarEvent, Object> _identities = {};
  Map<Object, AllDaySpan> _identitySpans = {};

  Object _eventSource(CalendarEvent event) =>
      (widget.scope, event.wsId, event.provider, event.sourceCalendarId);

  Iterable<String> _constituentIds(AllDaySpan span) =>
      span.isMerged ? span.mergedEventIds : [span.event.id];

  Object _eventId(CalendarEvent event) => (
    widget.scope,
    event.wsId,
    event.provider,
    event.sourceCalendarId,
    event.id,
  );

  Object _identity(AllDaySpan span) => _identities[span.event]!;

  void _reconcileIdentities() {
    final remaining = Map.of(_identities);
    final next = <CalendarEvent, Object>{};
    // Match unchanged occurrences before reconciling edits to their dates.
    for (final span in widget.layout.spans) {
      final event = span.event;
      final matches = remaining.keys.where(
        (previous) =>
            _eventId(previous) == _eventId(event) &&
            previous.startAt == event.startAt &&
            previous.endAt == event.endAt,
      );
      if (matches.isNotEmpty) {
        next[event] = remaining.remove(matches.first)!;
      }
    }
    for (final span in widget.layout.spans) {
      final event = span.event;
      if (next.containsKey(event)) continue;
      final matches = remaining.keys.where(
        (previous) => _eventId(previous) == _eventId(event),
      );
      if (matches.length == 1) {
        next[event] = remaining.remove(matches.single)!;
        continue;
      }
      final constituents = _constituentIds(span).toSet();
      final mergedMatches = remaining.keys.where((previous) {
        final previousSpan = _identitySpans[remaining[previous]]!;
        return (span.isMerged || previousSpan.isMerged) &&
            _eventSource(previous) == _eventSource(event) &&
            _constituentIds(previousSpan).any(constituents.contains);
      });
      next[event] = mergedMatches.length == 1
          ? remaining.remove(mergedMatches.single)!
          : Object();
    }
    _identities = next;
    _identitySpans = {
      for (final span in widget.layout.spans) next[span.event]!: span,
    };
  }

  @override
  void didUpdateWidget(_MultiDayAllDayRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.scope != widget.scope) {
      _identities = {};
      _identitySpans = {};
      _targets = {};
      _paintedTops = {};
      _previousTops = {};
      _lastHeight = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    _reconcileIdentities();
    final rowHeight = _MultiDayAllDayRow.rowHeight(context);
    final rows = math.min(
      widget.layout.maxRow + 1,
      widget.maxVisibleRows ?? widget.layout.maxRow + 1,
    );
    final visible = widget.layout.spans
        .where(
          (span) =>
              span.row < rows &&
              _allDaySpanVisible(
                span,
                gutterWidth: widget.timeGutterWidth,
                dayColumnWidth: widget.dayColumnWidth,
                viewportStart: widget.viewportStart,
                viewportWidth: widget.viewportWidth,
              ),
        )
        .toList();
    final targets = {
      for (final span in visible)
        _identity(span):
            span.row * (rowHeight + _MultiDayAllDayRow._rowGap) + 6,
    };
    if (targets.length != _targets.length ||
        targets.entries.any((entry) => _targets[entry.key] != entry.value)) {
      _previousTops = Map.of(_paintedTops);
      _startHeight = _lastHeight ?? widget.availableHeight;
      _targets = targets;
    }
    final targetHeight = _MultiDayAllDayRow.heightForRows(context, rows);
    final progress = (targetHeight - _startHeight).abs() < 0.01
        ? 1.0
        : ((widget.availableHeight - _startHeight) /
                  (targetHeight - _startHeight))
              .clamp(0.0, 1.0);
    final movingRetained = _previousTops.entries.any(
      (entry) =>
          targets.containsKey(entry.key) &&
          (targets[entry.key]! - entry.value).abs() > 0.01,
    );
    final rendered = visible.where((span) {
      final identity = _identity(span);
      return _previousTops.containsKey(identity) ||
          (targets[identity]! + rowHeight <= widget.availableHeight + 0.01 &&
              (!movingRetained || progress >= 1));
    }).toList();
    _paintedTops = {
      for (final span in rendered)
        _identity(span): _previousTops.containsKey(_identity(span))
            ? _previousTops[_identity(span)]! +
                  (targets[_identity(span)]! -
                          _previousTops[_identity(span)]!) *
                      progress
            : targets[_identity(span)]!,
    };
    _lastHeight = widget.availableHeight;
    if (targets.isEmpty) _previousTops = {};
    return SizedBox(
      height: widget.availableHeight,
      child: Stack(
        children: [
          for (final span in rendered)
            Positioned(
              key: ValueKey(_identity(span)),
              left:
                  widget.timeGutterWidth +
                  span.startIndex * widget.dayColumnWidth +
                  4,
              top: _paintedTops[_identity(span)],
              width: span.span * widget.dayColumnWidth - 8,
              height: rowHeight,
              child: _MultiDayAllDayChip(
                event: span.event,
                labelLeft: math.max(
                  0,
                  widget.viewportStart -
                      (widget.timeGutterWidth +
                          span.startIndex * widget.dayColumnWidth +
                          4),
                ),
                labelRight: math.max(
                  0,
                  widget.timeGutterWidth +
                      (span.startIndex + span.span) * widget.dayColumnWidth -
                      4 -
                      (widget.viewportStart + widget.viewportWidth),
                ),
                onTap: () => widget.onEventTap(span.event),
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
    required this.labelLeft,
    required this.labelRight,
  });

  final CalendarEvent event;
  final VoidCallback onTap;
  final double labelLeft;
  final double labelRight;

  @override
  Widget build(BuildContext context) {
    final accentColor = EventColors.inContext(event, context).accent;
    final foregroundColor = EventColors.inContext(event, context).foreground;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: EdgeInsets.only(
            left: labelLeft + 10,
            right: labelRight + 10,
          ),
          decoration: BoxDecoration(
            color: EventColors.inContext(event, context).background,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: accentColor),
          ),
          alignment: Alignment.centerLeft,
          child: LayoutBuilder(
            builder: (context, constraints) => Row(
              children: [
                if (constraints.maxWidth >= 18 &&
                    event.workingLocationKind != null) ...[
                  Icon(
                    workingLocationIcon(event.workingLocationKind!),
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
      ),
    );
  }
}

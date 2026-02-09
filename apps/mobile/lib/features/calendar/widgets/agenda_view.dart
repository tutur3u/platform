import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/features/calendar/utils/event_colors.dart';
import 'package:mobile/l10n/l10n.dart';

/// Scrollable agenda showing upcoming events grouped by date.
///
/// Displays a date header for each day followed by its events in a
/// card-like layout. Past events are dimmed. A "Now" indicator shows the
/// current time between past and future events.
///
/// Supports infinite scroll — when the user nears the bottom, [onLoadMore]
/// is called so the parent can fetch additional events from the server.
class AgendaView extends StatefulWidget {
  const AgendaView({
    required this.selectedDate,
    required this.events,
    required this.onEventTap,
    required this.onDaySelected,
    this.onLoadMore,
    this.isLoadingMore = false,
    super.key,
  });

  final DateTime selectedDate;
  final List<CalendarEvent> events;
  final ValueChanged<CalendarEvent> onEventTap;
  final ValueChanged<DateTime> onDaySelected;

  /// Called when the user scrolls near the bottom and more data is needed.
  final VoidCallback? onLoadMore;

  /// Whether additional events are currently being fetched.
  final bool isLoadingMore;

  @override
  State<AgendaView> createState() => _AgendaViewState();
}

class _AgendaViewState extends State<AgendaView> {
  final ScrollController _scrollController = ScrollController();
  bool _didAutoScroll = false;

  /// Threshold in pixels from the bottom to trigger loading more.
  static const _loadMoreThreshold = 300.0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToNow());
  }

  @override
  void didUpdateWidget(AgendaView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedDate != widget.selectedDate) {
      _didAutoScroll = false;
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToNow());
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToNow() {
    if (_didAutoScroll || !_scrollController.hasClients) return;
    _didAutoScroll = true;

    final items = _buildItems(widget.events, widget.selectedDate);
    final nowIndex = items.indexWhere((i) => i is _NowIndicatorItem);
    if (nowIndex < 0) return;

    // Approximate offset: each item ~60px, scroll a few items before "Now".
    final targetIndex = (nowIndex - 2).clamp(0, items.length);
    final offset = (targetIndex * 60.0).clamp(
      0.0,
      _scrollController.position.maxScrollExtent,
    );

    unawaited(
      _scrollController.animateTo(
        offset,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      ),
    );
  }

  void _onScroll() {
    if (!_scrollController.hasClients ||
        widget.isLoadingMore ||
        widget.onLoadMore == null) {
      return;
    }

    final maxScroll = _scrollController.position.maxScrollExtent;
    final currentScroll = _scrollController.offset;

    if (maxScroll - currentScroll <= _loadMoreThreshold) {
      widget.onLoadMore!();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final items = _buildItems(widget.events, widget.selectedDate);

    if (items.isEmpty && !widget.isLoadingMore) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.event_available,
              size: 48,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: 12),
            Text(
              l10n.calendarAgendaEmpty,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      );
    }

    // +1 for loading indicator at bottom.
    final itemCount = items.length + (widget.isLoadingMore ? 1 : 0);

    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: itemCount,
      controller: _scrollController,
      itemBuilder: (context, index) {
        // Loading spinner at the very end.
        if (index >= items.length) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: CircularProgressIndicator()),
          );
        }

        final item = items[index];
        if (item is _DateHeaderItem) {
          return _DateHeader(
            date: item.date,
            selectedDate: widget.selectedDate,
            onDaySelected: widget.onDaySelected,
          );
        } else if (item is _EventItem) {
          if (item.event.isAllDay) {
            return _AllDayBanner(
              event: item.event,
              isPast: item.isPast,
              displayDate: item.displayDate,
              onTap: () => widget.onEventTap(item.event),
            );
          }
          return _AgendaEventCard(
            event: item.event,
            isPast: item.isPast,
            onTap: () => widget.onEventTap(item.event),
          );
        } else if (item is _NowIndicatorItem) {
          return const _NowIndicator();
        } else if (item is _DividerItem) {
          return const Divider(indent: 16, endIndent: 16, height: 16);
        }
        return const SizedBox.shrink();
      },
    );
  }

  /// Builds a flat list of display items: date headers, events, now
  /// indicators, and dividers.
  ///
  /// Uses all events from [selectedDate] forward — no artificial end cap.
  /// The cubit controls how far ahead events are fetched.
  List<_AgendaItem> _buildItems(
    List<CalendarEvent> events,
    DateTime selectedDate,
  ) {
    final now = DateTime.now();
    final start = DateTime(
      selectedDate.year,
      selectedDate.month,
      selectedDate.day,
    );
    final grouped = <DateTime, List<CalendarEvent>>{};

    for (final event in events) {
      final eventStart = event.startAt;
      final eventEnd = event.endAt ?? eventStart;
      if (eventStart == null) continue;

      var day = DateTime(eventStart.year, eventStart.month, eventStart.day);
      // For all-day events, endAt is exclusive (midnight after last day).
      // Subtract 1 day to get the last inclusive calendar day.
      final rawEnd = DateTime(eventEnd!.year, eventEnd.month, eventEnd.day);
      final lastDay = event.isAllDay
          ? rawEnd.subtract(const Duration(days: 1))
          : rawEnd;

      while (!day.isAfter(lastDay)) {
        if (!day.isBefore(start)) {
          (grouped[day] ??= []).add(event);
        }
        day = day.add(const Duration(days: 1));
      }
    }

    final sortedDays = grouped.keys.toList()..sort();
    final items = <_AgendaItem>[];
    final today = DateTime(now.year, now.month, now.day);
    var insertedNow = false;

    for (var di = 0; di < sortedDays.length; di++) {
      final day = sortedDays[di];
      final dayEvents = grouped[day]!
        ..sort((a, b) {
          if (a.isAllDay && !b.isAllDay) return -1;
          if (!a.isAllDay && b.isAllDay) return 1;
          final aStart = a.startAt ?? DateTime(0);
          final bStart = b.startAt ?? DateTime(0);
          return aStart.compareTo(bStart);
        });

      if (di > 0) items.add(const _DividerItem());
      items.add(_DateHeaderItem(day));

      // For today, insert "Now" between past and upcoming *timed* events.
      // All-day events are shown first as a day-level group — they don't
      // participate in the "Now" insertion since they span the whole day.
      if (day == today && !insertedNow) {
        final allDay = dayEvents.where((e) => e.isAllDay).toList();
        final timed = dayEvents.where((e) => !e.isAllDay).toList();

        // All-day events first (active today = not past).
        for (final event in allDay) {
          items.add(_EventItem(event, isPast: false, displayDate: day));
        }

        // Timed events with "Now" inserted at the right position.
        var nowInserted = false;
        for (final event in timed) {
          final eventEnd = event.endAt ?? event.startAt;
          final isPast = eventEnd != null && eventEnd.isBefore(now);

          if (!nowInserted && !isPast) {
            items.add(const _NowIndicatorItem());
            nowInserted = true;
            insertedNow = true;
          }
          items.add(_EventItem(event, isPast: isPast, displayDate: day));
        }
        // If all timed events are past (or none exist), add "Now" after.
        if (!nowInserted) {
          items.add(const _NowIndicatorItem());
          insertedNow = true;
        }
      } else {
        final dayIsPast = day.isBefore(today);
        for (final event in dayEvents) {
          final eventEnd = event.endAt ?? event.startAt;
          final isPast =
              dayIsPast || (eventEnd != null && eventEnd.isBefore(now));
          items.add(_EventItem(event, isPast: isPast, displayDate: day));
        }
      }
    }

    // If "Now" wasn't inserted (no today events), insert before the first
    // future day.
    if (!insertedNow) {
      final firstFutureIdx = items.indexWhere((i) {
        if (i is _DateHeaderItem) return !i.date.isBefore(today);
        return false;
      });
      if (firstFutureIdx >= 0) {
        items.insert(firstFutureIdx, const _NowIndicatorItem());
      }
    }

    return items;
  }
}

// --- Item types for the flat list ---

sealed class _AgendaItem {
  const _AgendaItem();
}

class _DateHeaderItem extends _AgendaItem {
  const _DateHeaderItem(this.date);
  final DateTime date;
}

class _EventItem extends _AgendaItem {
  const _EventItem(
    this.event, {
    required this.isPast,
    required this.displayDate,
  });
  final CalendarEvent event;
  final bool isPast;

  /// The calendar date under which this event appears (used by all-day banners
  /// to compute "Day X of Y").
  final DateTime displayDate;
}

class _NowIndicatorItem extends _AgendaItem {
  const _NowIndicatorItem();
}

class _DividerItem extends _AgendaItem {
  const _DividerItem();
}

// --- Widgets ---

class _DateHeader extends StatelessWidget {
  const _DateHeader({
    required this.date,
    required this.selectedDate,
    required this.onDaySelected,
  });

  final DateTime date;
  final DateTime selectedDate;
  final ValueChanged<DateTime> onDaySelected;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final isToday = date == today;
    final isTomorrow = date == today.add(const Duration(days: 1));

    final dayName = DateFormat.EEEE().format(date);
    final dateStr = DateFormat.MMMd().format(date);
    final label = isToday
        ? 'Today'
        : isTomorrow
        ? 'Tomorrow'
        : dayName;

    return GestureDetector(
      onTap: () => onDaySelected(date),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isToday ? colorScheme.primary : null,
                border: !isToday
                    ? Border.all(color: colorScheme.outlineVariant)
                    : null,
              ),
              alignment: Alignment.center,
              child: Text(
                '${date.day}',
                style: textTheme.titleMedium?.copyWith(
                  color: isToday
                      ? colorScheme.onPrimary
                      : colorScheme.onSurface,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: textTheme.titleSmall?.copyWith(
                      color: isToday
                          ? colorScheme.primary
                          : colorScheme.onSurface,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    dateStr,
                    style: textTheme.bodySmall?.copyWith(
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NowIndicator extends StatefulWidget {
  const _NowIndicator();

  @override
  State<_NowIndicator> createState() => _NowIndicatorState();
}

class _NowIndicatorState extends State<_NowIndicator> {
  late Timer _timer;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) {
      setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final timeStr = DateFormat.jm().format(_now);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: colorScheme.error,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Container(
              height: 1.5,
              color: colorScheme.error,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            timeStr,
            style: textTheme.labelSmall?.copyWith(
              color: colorScheme.error,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// Banner-style card for all-day events in the agenda view.
///
/// Visually distinct from timed events: uses a gradient background, a leading
/// calendar icon, and shows "Day X of Y" for multi-day events with a thin
/// progress bar.
class _AllDayBanner extends StatelessWidget {
  const _AllDayBanner({
    required this.event,
    required this.isPast,
    required this.displayDate,
    required this.onTap,
  });

  final CalendarEvent event;
  final bool isPast;

  /// The calendar date this banner appears under — used to compute
  /// "Day X of Y" for multi-day events.
  final DateTime displayDate;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final baseColor = EventColors.fromString(event.color);
    final opacity = isPast ? 0.45 : 1.0;
    final info = _dayInfo();

    return Opacity(
      opacity: opacity,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 3,
          ),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                baseColor.withValues(alpha: 0.9),
                baseColor.withValues(alpha: 0.65),
              ],
            ),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Main content row.
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  12,
                  10,
                  12,
                  10,
                ),
                child: Row(
                  children: [
                    // Leading icon.
                    Icon(
                      Icons.wb_sunny_outlined,
                      size: 18,
                      color: Colors.white.withValues(alpha: 0.9),
                    ),
                    const SizedBox(width: 10),
                    // Title + subtitle.
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            event.title ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w600,
                              color: Colors.white,
                              decoration: isPast
                                  ? TextDecoration.lineThrough
                                  : null,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            _buildSubtitle(context, info),
                            style: textTheme.bodySmall?.copyWith(
                              color: Colors.white.withValues(alpha: 0.85),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (isPast)
                      Icon(
                        Icons.check_circle_outline,
                        size: 18,
                        color: Colors.white.withValues(alpha: 0.6),
                      ),
                  ],
                ),
              ),
              // Progress bar for multi-day events.
              if (info.totalDays > 1)
                ClipRRect(
                  borderRadius: const BorderRadius.vertical(
                    bottom: Radius.circular(10),
                  ),
                  child: LinearProgressIndicator(
                    value: info.dayNumber / info.totalDays,
                    minHeight: 3,
                    backgroundColor: Colors.white.withValues(alpha: 0.2),
                    valueColor: AlwaysStoppedAnimation(
                      Colors.white.withValues(alpha: 0.7),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  _DayInfo _dayInfo() {
    if (event.startAt == null || event.endAt == null) {
      return const _DayInfo(dayNumber: 1, totalDays: 1);
    }

    final startDay = DateTime(
      event.startAt!.year,
      event.startAt!.month,
      event.startAt!.day,
    );
    // endAt is exclusive (midnight after last day).
    final lastDay = event.endAt!.subtract(const Duration(days: 1));
    final endDay = DateTime(lastDay.year, lastDay.month, lastDay.day);
    final totalDays = endDay.difference(startDay).inDays + 1;

    if (totalDays <= 1) {
      return const _DayInfo(dayNumber: 1, totalDays: 1);
    }

    final day = DateTime(
      displayDate.year,
      displayDate.month,
      displayDate.day,
    );
    final dayNumber = day.difference(startDay).inDays + 1;
    return _DayInfo(dayNumber: dayNumber, totalDays: totalDays);
  }

  String _buildSubtitle(BuildContext context, _DayInfo info) {
    final l10n = context.l10n;
    if (info.totalDays <= 1) return l10n.calendarAllDay;

    final progress = l10n.calendarAllDayProgress(
      info.dayNumber,
      info.totalDays,
    );
    return '${l10n.calendarAllDay} · $progress';
  }
}

/// Helper to hold computed day-of-total info for an all-day banner.
class _DayInfo {
  const _DayInfo({required this.dayNumber, required this.totalDays});
  final int dayNumber;
  final int totalDays;
}

class _AgendaEventCard extends StatelessWidget {
  const _AgendaEventCard({
    required this.event,
    required this.isPast,
    required this.onTap,
  });

  final CalendarEvent event;
  final bool isPast;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final accentColor = EventColors.fromString(event.color);
    final titleColor = EventColors.bright(event.color);
    final opacity = isPast ? 0.45 : 1.0;

    final timeStr =
        '${_formatTime(event.startAt!)} - ${_formatTime(event.endAt!)}';

    return Opacity(
      opacity: opacity,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 3),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: EventColors.background(event.color),
            borderRadius: BorderRadius.circular(10),
            border: Border(
              left: BorderSide(color: accentColor, width: 4),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      event.title ?? '',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: titleColor,
                        decoration: isPast ? TextDecoration.lineThrough : null,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      timeStr,
                      style: textTheme.bodySmall?.copyWith(
                        color: titleColor.withValues(alpha: 0.8),
                      ),
                    ),
                    if (event.description != null &&
                        event.description!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        event.description!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: textTheme.bodySmall?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (isPast)
                Icon(
                  Icons.check_circle_outline,
                  size: 18,
                  color: colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
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

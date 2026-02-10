import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/data/models/calendar_event.dart';

/// A collapsible month/week calendar strip.
///
/// Defaults to **collapsed** (single week row). Tap the drag handle at the
/// bottom to expand into a full month grid. Both modes support horizontal
/// swiping — collapsed swipes weeks, expanded swipes months.
class MonthStrip extends StatefulWidget {
  const MonthStrip({
    required this.selectedDate,
    required this.focusedMonth,
    required this.events,
    required this.onDateSelected,
    required this.onMonthChanged,
    this.firstDayOfWeek = 0,
    super.key,
  });

  final DateTime selectedDate;
  final DateTime focusedMonth;
  final List<CalendarEvent> events;
  final ValueChanged<DateTime> onDateSelected;
  final ValueChanged<DateTime> onMonthChanged;

  /// 0 = Sunday, 1 = Monday, 6 = Saturday.
  final int firstDayOfWeek;

  @override
  State<MonthStrip> createState() => _MonthStripState();
}

class _MonthStripState extends State<MonthStrip> {
  bool _expanded = false;

  // --- Month paging (expanded mode) ---
  late PageController _monthPageController;
  static final _referenceMonth = DateTime(2020);
  static const _monthInitialPage = 500;

  // --- Week paging (collapsed mode) ---
  late PageController _weekPageController;
  // Reference: Sunday 5 Jan 2020.
  static final _referenceWeekStart = DateTime(2020, 1, 5);
  static const _weekInitialPage = 1000;

  @override
  void initState() {
    super.initState();
    _monthPageController = PageController(
      initialPage: _monthPageForMonth(widget.focusedMonth),
    );
    _weekPageController = PageController(
      initialPage: _weekPageForDate(widget.selectedDate),
    );
  }

  @override
  void didUpdateWidget(MonthStrip oldWidget) {
    super.didUpdateWidget(oldWidget);

    // Sync month page when focusedMonth changes.
    if (oldWidget.focusedMonth.year != widget.focusedMonth.year ||
        oldWidget.focusedMonth.month != widget.focusedMonth.month) {
      final targetPage = _monthPageForMonth(widget.focusedMonth);
      if (_monthPageController.hasClients &&
          (_monthPageController.page?.round() ?? 0) != targetPage) {
        unawaited(
          _monthPageController.animateToPage(
            targetPage,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeInOut,
          ),
        );
      }
    }

    // Sync week page when selectedDate changes.
    if (oldWidget.selectedDate != widget.selectedDate) {
      final targetPage = _weekPageForDate(widget.selectedDate);
      if (_weekPageController.hasClients &&
          (_weekPageController.page?.round() ?? 0) != targetPage) {
        unawaited(
          _weekPageController.animateToPage(
            targetPage,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeInOut,
          ),
        );
      }
    }
  }

  @override
  void dispose() {
    _monthPageController.dispose();
    _weekPageController.dispose();
    super.dispose();
  }

  // --- Month helpers ---

  int _monthPageForMonth(DateTime month) {
    return _monthInitialPage +
        (month.year - _referenceMonth.year) * 12 +
        (month.month - _referenceMonth.month);
  }

  DateTime _monthForPage(int page) {
    final offset = page - _monthInitialPage;
    final totalMonths =
        _referenceMonth.year * 12 + _referenceMonth.month - 1 + offset;
    return DateTime(totalMonths ~/ 12, totalMonths % 12 + 1);
  }

  // --- Week helpers ---

  /// Returns the first day of the week containing [date], based on the
  /// configured first day of week (0=Sun, 1=Mon, 6=Sat).
  DateTime _weekStartOf(DateTime date) {
    final d = DateTime(date.year, date.month, date.day);
    // d.weekday: Mon=1 … Sun=7. Convert to 0-based (Sun=0).
    final wd = d.weekday % 7;
    final fdow = widget.firstDayOfWeek;
    final diff = (wd - fdow + 7) % 7;
    return d.subtract(Duration(days: diff));
  }

  int _weekPageForDate(DateTime date) {
    final weekStart = _weekStartOf(date);
    final refStart = _weekStartOf(_referenceWeekStart);
    final diff = weekStart.difference(refStart).inDays;
    return _weekInitialPage + (diff ~/ 7);
  }

  DateTime _weekStartForPage(int page) {
    final offset = page - _weekInitialPage;
    final refStart = _weekStartOf(_referenceWeekStart);
    return refStart.add(Duration(days: offset * 7));
  }

  // --- Event check ---

  bool _hasEvents(DateTime date) {
    final dayStart = DateTime(date.year, date.month, date.day);
    final dayEnd = dayStart.add(const Duration(days: 1));
    return widget.events.any((e) {
      final start = e.startAt;
      final end = e.endAt ?? start;
      if (start == null) return false;
      return start.isBefore(dayEnd) && end!.isAfter(dayStart);
    });
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    const allDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    final fdow = widget.firstDayOfWeek;
    final weekDays = [
      for (var i = 0; i < 7; i++) allDays[(fdow + i) % 7],
    ];

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Weekday headers.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(
            children: weekDays
                .map(
                  (d) => Expanded(
                    child: Center(
                      child: Text(
                        d,
                        style: textTheme.labelSmall?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
        ),
        const SizedBox(height: 4),
        // Calendar body — cross-fade between collapsed week row and full
        // month grid. AnimatedCrossFade keeps both children alive so their
        // PageControllers stay attached.
        AnimatedCrossFade(
          duration: const Duration(milliseconds: 300),
          crossFadeState: _expanded
              ? CrossFadeState.showSecond
              : CrossFadeState.showFirst,
          // Collapsed: single week row.
          firstChild: SizedBox(
            height: 48,
            child: PageView.builder(
              controller: _weekPageController,
              onPageChanged: (page) {
                final weekStart = _weekStartForPage(page);
                // Use mid-week (Wednesday) to determine the display month.
                final midWeek = weekStart.add(const Duration(days: 3));
                widget.onMonthChanged(DateTime(midWeek.year, midWeek.month));
              },
              itemBuilder: (context, page) {
                final weekStart = _weekStartForPage(page);
                return _WeekRow(
                  weekStart: weekStart,
                  selectedDate: widget.selectedDate,
                  hasEvents: _hasEvents,
                  onDateSelected: widget.onDateSelected,
                );
              },
            ),
          ),
          // Expanded: full month grid (6 rows × 48px = 288px).
          secondChild: SizedBox(
            height: 288,
            child: PageView.builder(
              controller: _monthPageController,
              onPageChanged: (page) {
                widget.onMonthChanged(_monthForPage(page));
              },
              itemBuilder: (context, page) {
                final month = _monthForPage(page);
                return _MonthGrid(
                  month: month,
                  selectedDate: widget.selectedDate,
                  hasEvents: _hasEvents,
                  onDateSelected: widget.onDateSelected,
                  firstDayOfWeek: widget.firstDayOfWeek,
                );
              },
            ),
          ),
        ),
        // Drag handle to toggle collapsed / expanded.
        GestureDetector(
          onTap: () => setState(() => _expanded = !_expanded),
          behavior: HitTestBehavior.opaque,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Center(
              child: Container(
                width: 32,
                height: 4,
                decoration: BoxDecoration(
                  color: colorScheme.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Collapsed: single week row
// ---------------------------------------------------------------------------

class _WeekRow extends StatelessWidget {
  const _WeekRow({
    required this.weekStart,
    required this.selectedDate,
    required this.hasEvents,
    required this.onDateSelected,
  });

  final DateTime weekStart;
  final DateTime selectedDate;
  final bool Function(DateTime) hasEvents;
  final ValueChanged<DateTime> onDateSelected;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        children: List.generate(7, (i) {
          final date = weekStart.add(Duration(days: i));
          final isToday = date == today;
          final isSelected =
              date.year == selectedDate.year &&
              date.month == selectedDate.month &&
              date.day == selectedDate.day;
          final hasDot = hasEvents(date);

          return Expanded(
            child: GestureDetector(
              onTap: () => onDateSelected(date),
              behavior: HitTestBehavior.opaque,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    width: 32,
                    height: 32,
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
                  const SizedBox(height: 2),
                  Container(
                    width: 4,
                    height: 4,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: hasDot
                          ? (isSelected
                                ? colorScheme.primary
                                : colorScheme.onSurfaceVariant)
                          : Colors.transparent,
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Expanded: full month grid
// ---------------------------------------------------------------------------

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({
    required this.month,
    required this.selectedDate,
    required this.hasEvents,
    required this.onDateSelected,
    this.firstDayOfWeek = 0,
  });

  final DateTime month;
  final DateTime selectedDate;
  final bool Function(DateTime) hasEvents;
  final ValueChanged<DateTime> onDateSelected;
  final int firstDayOfWeek;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    final firstOfMonth = DateTime(month.year, month.month);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    // Convert weekday to 0-based (Sun=0), then offset by firstDayOfWeek.
    final startWeekday = (firstOfMonth.weekday % 7 - firstDayOfWeek + 7) % 7;

    final cells = <Widget>[];

    // Leading blanks.
    for (var i = 0; i < startWeekday; i++) {
      cells.add(const SizedBox());
    }

    // Day cells.
    for (var day = 1; day <= daysInMonth; day++) {
      final date = DateTime(month.year, month.month, day);
      final isToday = date == today;
      final isSelected =
          date.year == selectedDate.year &&
          date.month == selectedDate.month &&
          date.day == selectedDate.day;
      final hasDot = hasEvents(date);

      cells.add(
        GestureDetector(
          onTap: () => onDateSelected(date),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isSelected ? colorScheme.primary : null,
                  border: isToday && !isSelected
                      ? Border.all(color: colorScheme.primary)
                      : null,
                ),
                alignment: Alignment.center,
                child: Text(
                  '$day',
                  style: textTheme.bodySmall?.copyWith(
                    color: isSelected
                        ? colorScheme.onPrimary
                        : isToday
                        ? colorScheme.primary
                        : null,
                    fontWeight: isToday || isSelected ? FontWeight.w600 : null,
                  ),
                ),
              ),
              const SizedBox(height: 2),
              Container(
                width: 4,
                height: 4,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: hasDot
                      ? (isSelected
                            ? colorScheme.primary
                            : colorScheme.onSurfaceVariant)
                      : Colors.transparent,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: GridView(
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 7,
          mainAxisExtent: 48,
        ),
        children: cells,
      ),
    );
  }
}

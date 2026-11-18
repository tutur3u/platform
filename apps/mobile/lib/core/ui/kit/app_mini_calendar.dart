import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/l10n/l10n.dart';

/// Month grid or single week row. Dates and dots use the display timezone.
/// [firstDayOfWeek] uses Sunday=0. Paging requests a week or month start.
class AppMiniCalendar extends StatelessWidget {
  const AppMiniCalendar({
    required this.month,
    required this.selected,
    required this.today,
    required this.onSelect,
    required this.onPageChanged,
    this.firstDayOfWeek = 0,
    this.weekStart,
    this.onToggleExpanded,
    this.dotsForDay,
    this.maxHeight = double.infinity,
    super.key,
  });

  final DateTime month;
  final DateTime selected;
  final DateTime today;
  final int firstDayOfWeek;
  final DateTime? weekStart;
  final ValueChanged<DateTime> onSelect;
  final ValueChanged<DateTime> onPageChanged;
  final VoidCallback? onToggleExpanded;
  final List<Color> Function(DateTime)? dotsForDay;
  final double maxHeight;

  void _move(int delta) {
    final week = weekStart;
    onPageChanged(
      week == null
          ? DateTime.utc(month.year, month.month + delta)
          : week.add(Duration(days: delta * 7)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final material = MaterialLocalizations.of(context);
    final l10n = context.l10n;
    final start = DateTime.utc(month.year, month.month);
    final offset = (start.weekday % 7 - firstDayOfWeek + 7) % 7;
    final days = DateTime.utc(month.year, month.month + 1, 0).day;
    final week = weekStart;
    final rows = week == null ? ((offset + days) / 7).ceil() : 1;
    final toggle = onToggleExpanded;

    return GestureDetector(
      onHorizontalDragEnd: (details) {
        final velocity = details.primaryVelocity ?? 0;
        if (velocity.abs() > 100) _move(velocity < 0 ? 1 : -1);
      },
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            GestureDetector(
              onVerticalDragEnd: toggle == null
                  ? null
                  : (details) {
                      final velocity = details.primaryVelocity ?? 0;
                      if (week == null ? velocity < 0 : velocity > 0) toggle();
                    },
              child: ConstrainedBox(
                constraints: BoxConstraints(maxHeight: maxHeight),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        DateFormat.yMMMM(locale).format(month),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: tokens.typography.heading,
                      ),
                    ),
                    IconButton(
                      tooltip: week == null
                          ? material.previousMonthTooltip
                          : material.previousPageTooltip,
                      onPressed: () => _move(-1),
                      icon: const Icon(Icons.chevron_left),
                    ),
                    IconButton(
                      tooltip: week == null
                          ? material.nextMonthTooltip
                          : material.nextPageTooltip,
                      onPressed: () => _move(1),
                      icon: const Icon(Icons.chevron_right),
                    ),
                    if (toggle != null)
                      IconButton(
                        tooltip: week == null
                            ? l10n.calendarCollapseMonth
                            : l10n.calendarExpandMonth,
                        onPressed: toggle,
                        icon: Icon(
                          week == null ? Icons.expand_less : Icons.expand_more,
                        ),
                      ),
                  ],
                ),
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                primary: false,
                child: Column(
                  children: [
                    Row(
                      children: List.generate(
                        7,
                        (i) => Expanded(
                          child: Center(
                            child: Text(
                              material.narrowWeekdays[(firstDayOfWeek + i) % 7],
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: tokens.typography.caption.copyWith(
                                color: tokens.colorScheme.mutedForeground,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    for (var row = 0; row < rows; row++)
                      Row(
                        children: List.generate(7, (col) {
                          final day = row * 7 + col - offset + 1;
                          if (week == null && (day < 1 || day > days)) {
                            return const Expanded(child: SizedBox(height: 44));
                          }
                          final date =
                              week?.add(Duration(days: col)) ??
                              DateTime.utc(month.year, month.month, day);
                          return Expanded(
                            child: _DayCell(
                              date: date,
                              selected: DateUtils.isSameDay(date, selected),
                              today: DateUtils.isSameDay(date, today),
                              dots:
                                  dotsForDay?.call(date).take(3).toList() ??
                                  const [],
                              onTap: () => onSelect(date),
                            ),
                          );
                        }),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.date,
    required this.selected,
    required this.today,
    required this.dots,
    required this.onTap,
  });

  final DateTime date;
  final bool selected;
  final bool today;
  final List<Color> dots;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final material = MaterialLocalizations.of(context);
    return Semantics(
      button: true,
      selected: selected,
      label: [
        material.formatFullDate(date),
        if (today) l10n.calendarToday,
        if (dots.isNotEmpty) l10n.calendarHasEvents,
      ].join(', '),
      onTap: onTap,
      excludeSemantics: true,
      child: Material(
        color: selected ? c.primary : c.card,
        shape: CircleBorder(
          side: today && !selected
              ? BorderSide(color: c.primary)
              : BorderSide.none,
        ),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            height: 44,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      material.formatDecimal(date.day),
                      style: tokens.typography.uiSm.copyWith(
                        color: selected ? c.primaryForeground : c.foreground,
                      ),
                    ),
                  ),
                ),
                SizedBox(
                  height: 6,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (final color in dots)
                          Container(
                            width: 4,
                            height: 4,
                            margin: const EdgeInsets.symmetric(horizontal: 1),
                            decoration: BoxDecoration(
                              color: selected ? c.primaryForeground : color,
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
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

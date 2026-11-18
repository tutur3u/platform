import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Full-width month picker. Dates and dots are supplied in display timezone.
/// [firstDayOfWeek] uses Sunday=0; swiping requests the adjacent month.
class AppMiniCalendar extends StatelessWidget {
  const AppMiniCalendar({
    required this.month,
    required this.selected,
    required this.today,
    required this.onSelect,
    required this.onMonthChanged,
    this.firstDayOfWeek = 0,
    this.dotsForDay,
    super.key,
  });
  final DateTime month;
  final DateTime selected;
  final DateTime today;
  final int firstDayOfWeek;
  final ValueChanged<DateTime> onSelect;
  final ValueChanged<DateTime> onMonthChanged;
  final List<Color> Function(DateTime)? dotsForDay;
  bool _same(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
  void _move(int delta) =>
      onMonthChanged(DateTime.utc(month.year, month.month + delta));

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final start = DateTime.utc(month.year, month.month);
    final offset = (start.weekday % 7 - firstDayOfWeek + 7) % 7;
    final days = DateTime.utc(month.year, month.month + 1, 0).day;
    final rows = ((offset + days) / 7).ceil();
    return GestureDetector(
      onHorizontalDragEnd: (details) {
        if ((details.primaryVelocity ?? 0).abs() > 100) {
          _move(details.primaryVelocity! < 0 ? 1 : -1);
        }
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  DateFormat.yMMMM(locale).format(month),
                  style: tokens.typography.heading,
                ),
              ),
              IconButton(
                tooltip: MaterialLocalizations.of(context).previousMonthTooltip,
                onPressed: () => _move(-1),
                icon: const Icon(Icons.chevron_left),
              ),
              IconButton(
                tooltip: MaterialLocalizations.of(context).nextMonthTooltip,
                onPressed: () => _move(1),
                icon: const Icon(Icons.chevron_right),
              ),
            ],
          ),
          Row(
            children: List.generate(
              7,
              (i) => Expanded(
                child: Center(
                  child: Text(
                    DateFormat.E(locale).format(
                      DateTime.utc(2026, 11, 1 + (firstDayOfWeek + i) % 7),
                    ),
                    style: tokens.typography.caption.copyWith(
                      color: c.mutedForeground,
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
                if (day < 1 || day > days) {
                  return const Expanded(child: SizedBox(height: 44));
                }
                final date = DateTime.utc(month.year, month.month, day);
                final active = _same(date, selected);
                final dots =
                    dotsForDay?.call(date).take(3).toList() ?? <Color>[];
                return Expanded(
                  child: Semantics(
                    selected: active,
                    label: DateFormat.yMMMMEEEEd(locale).format(date),
                    child: Material(
                      color: active ? c.primary : c.card,
                      shape: CircleBorder(
                        side: _same(date, today) && !active
                            ? BorderSide(color: c.primary)
                            : BorderSide.none,
                      ),
                      child: InkWell(
                        customBorder: const CircleBorder(),
                        onTap: () => onSelect(date),
                        child: SizedBox(
                          height: 44,
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                '$day',
                                style: tokens.typography.uiSm.copyWith(
                                  color: active
                                      ? c.primaryForeground
                                      : c.foreground,
                                ),
                              ),
                              SizedBox(
                                height: 6,
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    for (final color in dots)
                                      Container(
                                        width: 4,
                                        height: 4,
                                        margin: const EdgeInsets.symmetric(
                                          horizontal: 1,
                                        ),
                                        decoration: BoxDecoration(
                                          color: active
                                              ? c.primaryForeground
                                              : color,
                                          shape: BoxShape.circle,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
        ],
      ),
    );
  }
}

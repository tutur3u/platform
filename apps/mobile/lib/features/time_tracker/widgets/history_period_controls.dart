import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class HistoryPeriodControls extends StatelessWidget {
  const HistoryPeriodControls({
    required this.viewMode,
    required this.anchorDate,
    required this.onPrevious,
    required this.onNext,
    super.key,
  });

  final HistoryViewMode viewMode;
  final DateTime anchorDate;
  final VoidCallback onPrevious;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final firstDayOfWeek = _weekdayFromMaterialLocalizations(
      MaterialLocalizations.of(context).firstDayOfWeekIndex,
    );
    final period = _periodRange(viewMode, anchorDate, firstDayOfWeek);
    final periodLabel = switch (viewMode) {
      HistoryViewMode.day => DateFormat.yMMMEd().format(period.start),
      HistoryViewMode.week => () {
        final weekStartLabel = DateFormat.MMMd().format(period.start);
        final weekEndLabel = DateFormat.MMMd().format(period.end);
        return '$weekStartLabel – $weekEndLabel';
      }(),
      HistoryViewMode.month => DateFormat.yMMMM().format(period.start),
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            shad.IconButton.ghost(
              onPressed: onPrevious,
              icon: const Icon(Icons.chevron_left),
            ),
            Expanded(
              child: Text(
                periodLabel,
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            shad.IconButton.ghost(
              onPressed: onNext,
              icon: const Icon(Icons.chevron_right),
            ),
          ],
        ),
      ],
    );
  }

  ({DateTime start, DateTime end}) _periodRange(
    HistoryViewMode mode,
    DateTime anchor,
    int firstDayOfWeek,
  ) {
    switch (mode) {
      case HistoryViewMode.day:
        final start = DateTime(anchor.year, anchor.month, anchor.day);
        return (start: start, end: start);
      case HistoryViewMode.week:
        final localAnchor = DateTime(
          anchor.year,
          anchor.month,
          anchor.day,
        );
        final offset = (localAnchor.weekday - firstDayOfWeek + 7) % 7;
        final start = localAnchor.subtract(Duration(days: offset));
        final end = start.add(const Duration(days: 6));
        return (start: start, end: end);
      case HistoryViewMode.month:
        final start = DateTime(anchor.year, anchor.month);
        final end = DateTime(anchor.year, anchor.month + 1, 0);
        return (start: start, end: end);
    }
  }

  int _weekdayFromMaterialLocalizations(int firstDayOfWeekIndex) {
    const weekdayByIndex = [
      DateTime.sunday,
      DateTime.monday,
      DateTime.tuesday,
      DateTime.wednesday,
      DateTime.thursday,
      DateTime.friday,
      DateTime.saturday,
    ];
    return weekdayByIndex[firstDayOfWeekIndex % 7];
  }
}

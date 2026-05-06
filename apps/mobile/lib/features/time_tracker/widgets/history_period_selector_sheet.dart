import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class HistoryPeriodSelectorSheet extends StatefulWidget {
  const HistoryPeriodSelectorSheet({
    required this.viewMode,
    required this.initialAnchorDate,
    required this.firstDayOfWeek,
    super.key,
  });

  final HistoryViewMode viewMode;
  final DateTime initialAnchorDate;
  final int firstDayOfWeek;

  @override
  State<HistoryPeriodSelectorSheet> createState() =>
      _HistoryPeriodSelectorSheetState();
}

class _HistoryPeriodSelectorSheetState
    extends State<HistoryPeriodSelectorSheet> {
  late int _selectedYear;
  late int _selectedMonth;
  late int _yearPageStart;
  bool _showYearPicker = false;

  @override
  void initState() {
    super.initState();
    _selectedYear = widget.initialAnchorDate.year;
    _selectedMonth = widget.initialAnchorDate.month;
    final rawStart = ((_selectedYear - 1) ~/ 12) * 12 + 1;
    _yearPageStart = rawStart < 2020 ? 2020 : rawStart;
  }

  void _toggleYearPicker() {
    setState(() {
      _showYearPicker = !_showYearPicker;
      if (_showYearPicker) {
        final rawStart = ((_selectedYear - 1) ~/ 12) * 12 + 1;
        _yearPageStart = rawStart < 2020 ? 2020 : rawStart;
      }
    });
  }

  void _selectYear(int year) {
    setState(() {
      _selectedYear = year;
      _showYearPicker = false;
    });
  }

  void _previousYearPage() =>
      setState(() => _yearPageStart = (_yearPageStart - 12).clamp(2020, 9999));
  void _nextYearPage() => setState(() => _yearPageStart += 12);

  void _previousMonth() {
    setState(() {
      if (_selectedMonth == 1) {
        if (_selectedYear > 2020) {
          _selectedMonth = 12;
          _selectedYear -= 1;
        }
      } else {
        _selectedMonth -= 1;
      }
    });
  }

  void _nextMonth() {
    setState(() {
      if (_selectedMonth == 12) {
        _selectedMonth = 1;
        _selectedYear += 1;
      } else {
        _selectedMonth += 1;
      }
    });
  }

  bool get _canGoToPreviousMonth =>
      _selectedYear > 2020 || (_selectedYear == 2020 && _selectedMonth > 1);

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: const BorderRadius.vertical(
          top: Radius.circular(16),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
          child: switch (widget.viewMode) {
            HistoryViewMode.day => _buildDayPicker(context, l10n),
            HistoryViewMode.week => _buildWeekPicker(context, l10n),
            HistoryViewMode.month => _buildMonthPicker(context, l10n),
          },
        ),
      ),
    );
  }

  Widget _buildDayPicker(BuildContext context, AppLocalizations l10n) {
    final now = DateTime.now();
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _HeaderRow(
          title: l10n.calendarDayView,
          onClose: () => Navigator.maybePop(context),
        ),
        const shad.Gap(8),
        CalendarDatePicker(
          initialDate: DateTime(
            widget.initialAnchorDate.year,
            widget.initialAnchorDate.month,
            widget.initialAnchorDate.day,
          ),
          firstDate: DateTime(2020),
          lastDate: DateTime(now.year + 5, 12, 31),
          onDateChanged: (date) => Navigator.of(context).pop(
            DateTime(date.year, date.month, date.day),
          ),
        ),
      ],
    );
  }

  Widget _buildWeekPicker(BuildContext context, AppLocalizations l10n) {
    if (_showYearPicker) {
      return _buildYearPickerGrid(
        context,
        l10n,
        onYearSelected: _selectYear,
      );
    }
    final weekStarts = _weekStartsForMonth(
      _selectedYear,
      _selectedMonth,
      widget.firstDayOfWeek,
    );
    final selectedStart = _weekStart(
      widget.initialAnchorDate,
      widget.firstDayOfWeek,
    );
    final now = DateTime.now();
    final currentWeekStart = _weekStart(now, widget.firstDayOfWeek);
    final monthLabel = DateFormat.yMMMM().format(
      DateTime(_selectedYear, _selectedMonth),
    );
    return SizedBox(
      height: 480,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _HeaderRow(
            title: l10n.calendarWeekView,
            onClose: () => Navigator.maybePop(context),
          ),
          const shad.Gap(8),
          _YearStepper(
            year: _selectedYear,
            label: monthLabel,
            onPrevious: _previousMonth,
            onNext: _nextMonth,
            onYearTap: _toggleYearPicker,
            previousEnabled: _canGoToPreviousMonth,
          ),
          const shad.Gap(12),
          Expanded(
            child: ListView.separated(
              itemCount: weekStarts.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final start = weekStarts[index];
                final end = start.add(const Duration(days: 6));
                final isSelected = _isSameDate(start, selectedStart);
                final isCurrent = _isSameDate(start, currentWeekStart);
                return _WeekRow(
                  start: start,
                  end: end,
                  isSelected: isSelected,
                  isCurrent: isCurrent,
                  onTap: () => Navigator.of(context).pop(start),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMonthPicker(BuildContext context, AppLocalizations l10n) {
    if (_showYearPicker) {
      return _buildYearPickerGrid(context, l10n, onYearSelected: _selectYear);
    }
    final selected = DateTime(
      widget.initialAnchorDate.year,
      widget.initialAnchorDate.month,
    );
    return SizedBox(
      height: 400,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _HeaderRow(
            title: l10n.calendarMonthView,
            onClose: () => Navigator.maybePop(context),
          ),
          const shad.Gap(8),
          _YearStepper(
            year: _selectedYear,
            onPrevious: () => setState(
              () => _selectedYear = (_selectedYear - 1).clamp(2020, 9999),
            ),
            onNext: () => setState(() => _selectedYear += 1),
            onYearTap: _toggleYearPicker,
            previousEnabled: _selectedYear > 2020,
          ),
          const shad.Gap(16),
          Expanded(
            child: GridView.builder(
              itemCount: 12,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 2.2,
              ),
              itemBuilder: (context, index) {
                final month = index + 1;
                final monthDate = DateTime(_selectedYear, month);
                final isSelected =
                    monthDate.year == selected.year &&
                    monthDate.month == selected.month;
                return _MonthCell(
                  monthDate: monthDate,
                  isSelected: isSelected,
                  onTap: () => Navigator.of(context).pop(monthDate),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildYearPickerGrid(
    BuildContext context,
    AppLocalizations l10n, {
    required void Function(int) onYearSelected,
  }) {
    final years = List.generate(12, (index) => _yearPageStart + index);
    final pageEnd = _yearPageStart + 11;
    return SizedBox(
      height: 480,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _HeaderRow(
            title: 'Year',
            onClose: () => Navigator.maybePop(context),
          ),
          const shad.Gap(16),
          _YearStepper(
            year: _selectedYear,
            onPrevious: _previousYearPage,
            onNext: _nextYearPage,
            label: '$_yearPageStart – $pageEnd',
            previousEnabled: _yearPageStart > 2020,
          ),
          const shad.Gap(16),
          Expanded(
            child: GridView.builder(
              itemCount: years.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 2.2,
              ),
              itemBuilder: (context, index) {
                final year = years[index];
                final isSelected = year == _selectedYear;
                return _MonthCell(
                  label: '$year',
                  isSelected: isSelected,
                  onTap: () => onYearSelected(year),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  List<DateTime> _weekStartsForMonth(
    int year,
    int month,
    int firstDayOfWeek,
  ) {
    final monthStart = DateTime(year, month);
    final monthEnd = DateTime(year, month + 1, 0);
    final starts = <DateTime>[];
    var cursor = _weekStart(monthStart, firstDayOfWeek);
    while (!cursor.isAfter(monthEnd)) {
      starts.add(cursor);
      cursor = cursor.add(const Duration(days: 7));
    }
    return starts;
  }

  DateTime _weekStart(DateTime value, int firstDayOfWeek) {
    final local = DateTime(value.year, value.month, value.day);
    final offset = (local.weekday - firstDayOfWeek + 7) % 7;
    return local.subtract(Duration(days: offset));
  }

  bool _isSameDate(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }
}

class _HeaderRow extends StatelessWidget {
  const _HeaderRow({required this.title, required this.onClose});

  final String title;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: theme.typography.large.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
        shad.IconButton.ghost(
          icon: const Icon(Icons.close),
          onPressed: onClose,
        ),
      ],
    );
  }
}

class _YearStepper extends StatelessWidget {
  const _YearStepper({
    required this.year,
    required this.onPrevious,
    required this.onNext,
    this.onYearTap,
    this.label,
    this.previousEnabled = true,
  });

  final int year;
  final VoidCallback onPrevious;
  final VoidCallback onNext;
  final VoidCallback? onYearTap;
  final String? label;
  final bool previousEnabled;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Row(
      children: [
        shad.IconButton.ghost(
          onPressed: previousEnabled ? onPrevious : null,
          icon: const Icon(Icons.chevron_left),
        ),
        Expanded(
          child: GestureDetector(
            onTap: onYearTap,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  label ?? '$year',
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (onYearTap != null) ...[
                  const SizedBox(width: 4),
                  Icon(
                    Icons.expand_more,
                    size: 18,
                    color: theme.colorScheme.mutedForeground,
                  ),
                ],
              ],
            ),
          ),
        ),
        shad.IconButton.ghost(
          onPressed: onNext,
          icon: const Icon(Icons.chevron_right),
        ),
      ],
    );
  }
}

class _WeekRow extends StatelessWidget {
  const _WeekRow({
    required this.start,
    required this.end,
    required this.isSelected,
    required this.isCurrent,
    required this.onTap,
  });

  final DateTime start;
  final DateTime end;
  final bool isSelected;
  final bool isCurrent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final bgColor = isSelected
        ? theme.colorScheme.primary
        : theme.colorScheme.muted.withValues(alpha: 0.08);
    final fgColor = isSelected
        ? theme.colorScheme.primaryForeground
        : theme.colorScheme.foreground;
    final secondaryFgColor = isSelected
        ? theme.colorScheme.primaryForeground.withValues(alpha: 0.8)
        : theme.colorScheme.mutedForeground;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${DateFormat.MMMd().format(start)} – '
                      '${DateFormat.MMMd().format(end)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w600,
                        color: fgColor,
                      ),
                    ),
                    if (isCurrent)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          'Current',
                          style: theme.typography.small.copyWith(
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            color: secondaryFgColor,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (isSelected)
                Icon(
                  Icons.check_circle,
                  size: 20,
                  color: theme.colorScheme.primaryForeground,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MonthCell extends StatelessWidget {
  const _MonthCell({
    required this.isSelected,
    required this.onTap,
    this.monthDate,
    this.label,
  });

  final DateTime? monthDate;
  final String? label;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final text = label ?? DateFormat.MMM().format(monthDate!);
    final bgColor = isSelected
        ? theme.colorScheme.primary
        : theme.colorScheme.muted.withValues(alpha: 0.08);
    final fgColor = isSelected
        ? theme.colorScheme.primaryForeground
        : theme.colorScheme.foreground;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            text,
            style: theme.typography.small.copyWith(
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
              color: fgColor,
            ),
          ),
        ),
      ),
    );
  }
}

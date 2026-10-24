import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/components/app_year_picker.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_dialog.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';

Future<DateTime?> showAppDatePicker({
  required BuildContext context,
  required DateTime initialDate,
  required DateTime firstDate,
  required DateTime lastDate,
}) => showAppSheet<DateTime>(
  context: context,
  builder: (_) => AppDatePicker(
    initialDate: initialDate,
    firstDate: firstDate,
    lastDate: lastDate,
  ),
);

class AppDatePicker extends StatefulWidget {
  const AppDatePicker({
    required this.initialDate,
    required this.firstDate,
    required this.lastDate,
    super.key,
  });
  final DateTime initialDate;
  final DateTime firstDate;
  final DateTime lastDate;
  @override
  State<AppDatePicker> createState() => _AppDatePickerState();
}

class _AppDatePickerState extends State<AppDatePicker> {
  late DateTime _month = DateTime(
    widget.initialDate.year,
    widget.initialDate.month,
  );
  bool _allowed(DateTime date) =>
      !date.isBefore(DateUtils.dateOnly(widget.firstDate)) &&
      !date.isAfter(DateUtils.dateOnly(widget.lastDate));
  void _move(int offset) =>
      setState(() => _month = DateTime(_month.year, _month.month + offset));

  @override
  Widget build(BuildContext context) {
    final m = MaterialLocalizations.of(context);
    final first = (_month.weekday - m.firstDayOfWeekIndex) % 7;
    final days = DateTime(_month.year, _month.month + 1, 0).day;
    final previous = DateTime(_month.year, _month.month, 0);
    final next = DateTime(_month.year, _month.month + 1);
    return AppDialog(
      title: m.datePickerHelpText,
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              AppIconButton(
                icon: const Icon(LucideIcons.chevronLeft),
                tooltip: m.previousMonthTooltip,
                onPressed:
                    previous.isBefore(DateUtils.dateOnly(widget.firstDate))
                    ? null
                    : () => _move(-1),
              ),
              Expanded(
                child: AppButton.ghost(
                  onPressed: () async {
                    final year = await showAppSheet<int>(
                      context: context,
                      size: AppSheetSize.medium,
                      builder: (_) => AppYearPicker(
                        initialYear: _month.year,
                        firstYear: widget.firstDate.year,
                        lastYear: widget.lastDate.year,
                      ),
                    );
                    if (year == null || !mounted) return;
                    setState(() => _month = DateTime(year, _month.month));
                  },
                  child: Text(m.formatMonthYear(_month)),
                ),
              ),
              AppIconButton(
                icon: const Icon(LucideIcons.chevronRight),
                tooltip: m.nextMonthTooltip,
                onPressed: next.isAfter(widget.lastDate)
                    ? null
                    : () => _move(1),
              ),
            ],
          ),
          Row(
            children: [
              for (var i = 0; i < 7; i++)
                Expanded(
                  child: Center(
                    child: Text(
                      m.narrowWeekdays[(i + m.firstDayOfWeekIndex) % 7],
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          for (var row = 0; row < (first + days + 6) ~/ 7; row++)
            Row(
              children: [
                for (var col = 0; col < 7; col++)
                  Expanded(child: _day(row * 7 + col - first + 1, days, m)),
              ],
            ),
        ],
      ),
      actions: [
        AppButton.ghost(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(m.cancelButtonLabel),
        ),
      ],
    );
  }

  Widget _day(int day, int days, MaterialLocalizations m) {
    if (day < 1 || day > days) return const SizedBox(height: 48);
    final date = DateTime(_month.year, _month.month, day);
    final selected = DateUtils.isSameDay(date, widget.initialDate);
    return Semantics(
      label: m.formatFullDate(date),
      selected: selected,
      child: AppButton(
        variant: selected ? AppButtonVariant.primary : AppButtonVariant.ghost,
        onPressed: _allowed(date)
            ? () => Navigator.of(context).pop(date)
            : null,
        child: Text(m.formatDecimal(day)),
      ),
    );
  }
}

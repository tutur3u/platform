import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/calendar_recurrence.dart';
import 'package:mobile/features/calendar/utils/calendar_date_time.dart';
import 'package:mobile/features/calendar/utils/calendar_recurrence_draft.dart';
import 'package:mobile/l10n/l10n.dart';

String recurrenceFrequencyLabel(
  AppLocalizations l10n,
  CalendarRecurrenceFrequency frequency,
) => switch (frequency) {
  CalendarRecurrenceFrequency.daily => l10n.calendarRecurrenceDaily,
  CalendarRecurrenceFrequency.weekly => l10n.calendarRecurrenceWeekly,
  CalendarRecurrenceFrequency.monthly => l10n.calendarRecurrenceMonthly,
  CalendarRecurrenceFrequency.yearly => l10n.calendarRecurrenceYearly,
};

String recurrenceSummary(AppLocalizations l10n, RecurrencePattern? pattern) {
  if (pattern == null) return l10n.calendarRecurrenceNone;
  final frequency = recurrenceFrequencyLabel(l10n, pattern.frequency);
  return pattern.interval == 1
      ? frequency
      : l10n.calendarRecurrenceSummaryInterval(frequency, pattern.interval);
}

/// Edits a pattern for a series starting at [start]. Pops `(pattern: null)`
/// for "Does not repeat" when [allowNone], or nothing when dismissed.
Future<({RecurrencePattern? pattern})?> showRecurrencePatternSheet(
  BuildContext context, {
  required RecurrencePattern initial,
  required DateTime start,
  bool allowNone = true,
}) => showAppSheet<({RecurrencePattern? pattern})>(
  context: context,
  builder: (_) => RecurrencePatternSheet(
    initial: initial,
    start: start,
    allowNone: allowNone,
  ),
);

class RecurrencePatternSheet extends StatefulWidget {
  const RecurrencePatternSheet({
    required this.initial,
    required this.start,
    this.allowNone = true,
    super.key,
  });

  final RecurrencePattern initial;
  final DateTime start;
  final bool allowNone;

  @override
  State<RecurrencePatternSheet> createState() => _RecurrencePatternSheetState();
}

class _RecurrencePatternSheetState extends State<RecurrencePatternSheet> {
  late RecurrencePattern _pattern = widget.initial;
  late final _interval = TextEditingController(
    text: '${widget.initial.interval}',
  );
  late final _monthDay = TextEditingController(
    text: '${widget.initial.monthDay}',
  );
  late final _count = TextEditingController(text: '${widget.initial.count}');
  bool _invalid = false;

  @override
  void dispose() {
    _interval.dispose();
    _monthDay.dispose();
    _count.dispose();
    super.dispose();
  }

  void _set(RecurrencePattern next) => setState(() {
    _pattern = next;
    _invalid = false;
  });

  int _number(TextEditingController controller) =>
      int.tryParse(controller.text) ?? 0;

  void _done() {
    final pattern = _pattern.copyWith(
      interval: _number(_interval),
      monthDay: _number(_monthDay),
      count: _number(_count),
    );
    if (!pattern.isValidFor(widget.start)) {
      setState(() => _invalid = true);
      return;
    }
    Navigator.of(context).pop((pattern: pattern));
  }

  Future<void> _pickUntil() async {
    final initial = _pattern.until ?? widget.start;
    final picked = await showAppDatePicker(
      context: context,
      initialDate: initial,
      firstDate: calendarDate(2020),
      lastDate: calendarDate(2100),
    );
    if (picked == null || !mounted) return;
    _set(
      _pattern.copyWith(
        until: calendarDate(picked.year, picked.month, picked.day),
      ),
    );
  }

  Widget _labeled(String label, Widget select) => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(label, style: Theme.of(context).textTheme.labelLarge),
      const SizedBox(height: 6),
      select,
    ],
  );

  Widget _numberField(
    TextEditingController controller,
    String label,
    int placeholder,
  ) => AppTextField(
    controller: controller,
    label: label,
    placeholder: '$placeholder',
    keyboardType: TextInputType.number,
    inputFormatters: [
      FilteringTextInputFormatter.digitsOnly,
      LengthLimitingTextInputFormatter(5),
    ],
    onChanged: (_) => setState(() => _invalid = false),
  );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = AppTokens.of(context).colorScheme;
    final locale = l10n.localeName;
    final pattern = _pattern;
    final monthly =
        pattern.frequency == CalendarRecurrenceFrequency.monthly ||
        pattern.frequency == CalendarRecurrenceFrequency.yearly;
    const gap = SizedBox(height: 12);
    return AppSheetScaffold(
      title: l10n.calendarRecurrenceRepeat,
      actions: [
        if (widget.allowNone)
          AppButton.ghost(
            onPressed: () => Navigator.of(context).pop((pattern: null)),
            child: Text(l10n.calendarRecurrenceNone),
          ),
        AppButton.primary(onPressed: _done, child: Text(l10n.commonDone)),
      ],
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_invalid) ...[
            Text(
              l10n.calendarRecurrenceInvalid,
              style: TextStyle(color: c.destructive),
            ),
            gap,
          ],
          AppSelect<CalendarRecurrenceFrequency>(
            title: l10n.calendarRecurrenceRepeat,
            value: pattern.frequency,
            options: [
              for (final value in CalendarRecurrenceFrequency.values)
                AppSelectOption(
                  value: value,
                  label: recurrenceFrequencyLabel(l10n, value),
                ),
            ],
            onChanged: (value) => _set(pattern.copyWith(frequency: value)),
          ),
          gap,
          _numberField(_interval, l10n.calendarRecurrenceInterval, 1),
          if (monthly) ...[
            gap,
            _labeled(
              l10n.calendarRecurrenceMonthPattern,
              AppSelect<bool>(
                title: l10n.calendarRecurrenceMonthPattern,
                value: pattern.byWeekday,
                options: [
                  AppSelectOption(
                    value: false,
                    label: l10n.calendarRecurrenceMonthDayPattern,
                  ),
                  AppSelectOption(
                    value: true,
                    label: l10n.calendarRecurrenceMonthWeekdayPattern,
                  ),
                ],
                onChanged: (value) => _set(pattern.copyWith(byWeekday: value)),
              ),
            ),
            gap,
            if (pattern.byWeekday)
              _labeled(
                l10n.calendarRecurrenceWeekIndex,
                AppSelect<int>(
                  title: l10n.calendarRecurrenceWeekIndex,
                  value: pattern.weekIndex,
                  options: [
                    AppSelectOption(
                      value: 1,
                      label: l10n.calendarRecurrenceOrdinal1,
                    ),
                    AppSelectOption(
                      value: 2,
                      label: l10n.calendarRecurrenceOrdinal2,
                    ),
                    AppSelectOption(
                      value: 3,
                      label: l10n.calendarRecurrenceOrdinal3,
                    ),
                    AppSelectOption(
                      value: 4,
                      label: l10n.calendarRecurrenceOrdinal4,
                    ),
                    AppSelectOption(
                      value: -1,
                      label: l10n.calendarRecurrenceOrdinalLast,
                    ),
                  ],
                  onChanged: (value) =>
                      _set(pattern.copyWith(weekIndex: value)),
                ),
              )
            else ...[
              _numberField(
                _monthDay,
                l10n.calendarRecurrenceMonthDayPattern,
                widget.start.day,
              ),
              gap,
              _labeled(
                l10n.calendarRecurrenceMonthDayOverflow,
                AppSelect<String>(
                  title: l10n.calendarRecurrenceMonthDayOverflow,
                  value: pattern.monthDayOverflow,
                  options: [
                    AppSelectOption(
                      value: 'skip',
                      label: l10n.calendarRecurrenceMonthDaySkip,
                    ),
                    AppSelectOption(
                      value: 'last-day',
                      label: l10n.calendarRecurrenceMonthDayLast,
                    ),
                  ],
                  onChanged: (value) =>
                      _set(pattern.copyWith(monthDayOverflow: value)),
                ),
              ),
            ],
          ],
          if (pattern.frequency == CalendarRecurrenceFrequency.yearly) ...[
            gap,
            _labeled(
              l10n.calendarRecurrenceMonth,
              AppSelect<int>(
                title: l10n.calendarRecurrenceMonth,
                value: pattern.month,
                options: [
                  for (var month = 1; month <= 12; month++)
                    AppSelectOption(
                      value: month,
                      label: DateFormat.MMMM(
                        locale,
                      ).format(DateTime(2026, month)),
                    ),
                ],
                onChanged: (value) => _set(pattern.copyWith(month: value)),
              ),
            ),
          ],
          if (pattern.usesWeekdays) ...[
            gap,
            Text(
              l10n.calendarRecurrenceWeekdays,
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final (index, day) in calendarRecurrenceWeekdays.indexed)
                  AppChip(
                    // 2024-01-01 is a Monday.
                    label: Text(
                      DateFormat.E(locale).format(DateTime(2024, 1, 1 + index)),
                    ),
                    selected: pattern.weekdays.contains(day),
                    onSelected: (selected) => _set(
                      pattern.copyWith(
                        weekdays: selected
                            ? [...pattern.weekdays, day]
                            : pattern.weekdays.where((d) => d != day).toList(),
                      ),
                    ),
                  ),
              ],
            ),
          ],
          if (monthly && pattern.byWeekday) ...[
            const SizedBox(height: 8),
            Text(
              l10n.calendarRecurrenceRelativeWeekdayHelp,
              style: AppTokens.of(
                context,
              ).typography.bodySm.copyWith(color: c.mutedForeground),
            ),
          ],
          gap,
          _labeled(
            l10n.calendarRecurrenceEnding,
            AppSelect<CalendarRecurrenceEndType>(
              title: l10n.calendarRecurrenceEnding,
              value: pattern.endType,
              options: [
                AppSelectOption(
                  value: CalendarRecurrenceEndType.never,
                  label: l10n.calendarRecurrenceEndNever,
                ),
                AppSelectOption(
                  value: CalendarRecurrenceEndType.count,
                  label: l10n.calendarRecurrenceEndCount,
                ),
                AppSelectOption(
                  value: CalendarRecurrenceEndType.until,
                  label: l10n.calendarRecurrenceEndUntil,
                ),
              ],
              onChanged: (value) => _set(pattern.copyWith(endType: value)),
            ),
          ),
          if (pattern.endType == CalendarRecurrenceEndType.count) ...[
            gap,
            _numberField(_count, l10n.calendarRecurrenceEndCount, 10),
          ],
          if (pattern.endType == CalendarRecurrenceEndType.until) ...[
            gap,
            Row(
              children: [
                Expanded(child: Text(l10n.calendarRecurrenceEndUntil)),
                AppChip(
                  label: Text(
                    pattern.until == null
                        ? l10n.calendarRecurrenceEndUntil
                        : DateFormat.yMMMd(locale).format(pattern.until!),
                  ),
                  onPressed: _pickUntil,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/core/ui/components/app_text_field.dart';
import 'package:mobile/core/ui/overlays/app_dialog.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';

Future<TimeOfDay?> showAppTimePicker({
  required BuildContext context,
  required TimeOfDay initialTime,
}) => showAppSheet<TimeOfDay>(
  context: context,
  builder: (_) => AppTimePicker(initialTime: initialTime),
);

class AppTimePicker extends StatefulWidget {
  const AppTimePicker({required this.initialTime, super.key});
  final TimeOfDay initialTime;
  @override
  State<AppTimePicker> createState() => _AppTimePickerState();
}

class _AppTimePickerState extends State<AppTimePicker> {
  final _hour = TextEditingController();
  final _minute = TextEditingController();
  late DayPeriod _period = widget.initialTime.period;
  bool _ready = false;
  bool _invalid = false;
  bool get _use24 =>
      MediaQuery.alwaysUse24HourFormatOf(context) ||
      MaterialLocalizations.of(context).timeOfDayFormat() ==
          TimeOfDayFormat.HH_colon_mm;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    _hour.text =
        (_use24
                ? widget.initialTime.hour
                : (widget.initialTime.hourOfPeriod == 0
                      ? 12
                      : widget.initialTime.hourOfPeriod))
            .toString();
    _minute.text = widget.initialTime.minute.toString().padLeft(2, '0');
  }

  @override
  void dispose() {
    _hour.dispose();
    _minute.dispose();
    super.dispose();
  }

  void _save() {
    final hour = int.tryParse(_hour.text);
    final minute = int.tryParse(_minute.text);
    if (hour == null ||
        minute == null ||
        minute > 59 ||
        hour < (_use24 ? 0 : 1) ||
        hour > (_use24 ? 23 : 12)) {
      setState(() => _invalid = true);
      return;
    }
    Navigator.of(context).pop(
      TimeOfDay(
        hour: _use24 ? hour : hour % 12 + (_period == DayPeriod.pm ? 12 : 0),
        minute: minute,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final m = MaterialLocalizations.of(context);
    return AppDialog(
      title: m.timePickerInputHelpText,
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: AppTextField(
                  placeholder: m.formatHour(
                    const TimeOfDay(hour: 9, minute: 30),
                    alwaysUse24HourFormat: _use24,
                  ),
                  controller: _hour,
                  label: m.timePickerHourLabel,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(2),
                  ],
                ),
              ),
              const Padding(padding: EdgeInsets.all(12), child: Text(':')),
              Expanded(
                child: AppTextField(
                  placeholder: m.formatMinute(
                    const TimeOfDay(hour: 9, minute: 30),
                  ),
                  controller: _minute,
                  label: m.timePickerMinuteLabel,
                  keyboardType: TextInputType.number,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(2),
                  ],
                ),
              ),
            ],
          ),
          if (!_use24)
            Wrap(
              spacing: 8,
              children: [
                for (final period in DayPeriod.values)
                  AppChip(
                    label: Text(
                      period == DayPeriod.am
                          ? m.anteMeridiemAbbreviation
                          : m.postMeridiemAbbreviation,
                    ),
                    selected: _period == period,
                    inMutuallyExclusiveGroup: true,
                    onSelected: (_) => setState(() => _period = period),
                  ),
              ],
            ),
          if (_invalid) Text(m.invalidTimeLabel),
        ],
      ),
      actions: [
        AppButton.ghost(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(m.cancelButtonLabel),
        ),
        AppButton.primary(onPressed: _save, child: Text(m.okButtonLabel)),
      ],
    );
  }
}

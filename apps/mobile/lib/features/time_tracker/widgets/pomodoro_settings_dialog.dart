import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class PomodoroSettingsDialog extends StatefulWidget {
  const PomodoroSettingsDialog({
    required this.settings,
    required this.onSave,
    super.key,
  });

  final PomodoroSettings settings;
  final ValueChanged<PomodoroSettings> onSave;

  @override
  State<PomodoroSettingsDialog> createState() => _PomodoroSettingsDialogState();
}

class _PomodoroSettingsDialogState extends State<PomodoroSettingsDialog> {
  late PomodoroSettings _settings;

  @override
  void initState() {
    super.initState();
    _settings = widget.settings;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppDialogScaffold(
      title: l10n.timerPomodoroSettings,
      description: l10n.timerPomodoroSettingsDescription,
      icon: Icons.timer_outlined,
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: () {
            widget.onSave(_settings);
            Navigator.of(context).pop();
          },
          child: Text(l10n.timerSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SliderSetting(
            label: l10n.timerFocusTime,
            value: _settings.focusMinutes.toDouble(),
            min: 15,
            max: 60,
            suffix: l10n.settingsMinutesUnit,
            onChanged: (v) => setState(
              () => _settings = _settings.copyWith(focusMinutes: v.round()),
            ),
          ),
          _SliderSetting(
            label: l10n.timerShortBreak,
            value: _settings.shortBreakMinutes.toDouble(),
            min: 3,
            max: 15,
            suffix: l10n.settingsMinutesUnit,
            onChanged: (v) => setState(
              () => _settings = _settings.copyWith(
                shortBreakMinutes: v.round(),
              ),
            ),
          ),
          _SliderSetting(
            label: l10n.timerLongBreak,
            value: _settings.longBreakMinutes.toDouble(),
            min: 10,
            max: 30,
            suffix: l10n.settingsMinutesUnit,
            onChanged: (v) => setState(
              () => _settings = _settings.copyWith(longBreakMinutes: v.round()),
            ),
          ),
          _SliderSetting(
            label: l10n.timerSessionsUntilLong,
            value: _settings.sessionsUntilLongBreak.toDouble(),
            min: 2,
            max: 6,
            onChanged: (v) => setState(
              () => _settings = _settings.copyWith(
                sessionsUntilLongBreak: v.round(),
              ),
            ),
          ),
          const shad.Gap(8),
          _SwitchSettingRow(
            label: l10n.timerAutoStartBreaks,
            value: _settings.autoStartBreaks,
            onChanged: (value) => setState(
              () => _settings = _settings.copyWith(autoStartBreaks: value),
            ),
          ),
          const shad.Gap(12),
          _SwitchSettingRow(
            label: l10n.timerAutoStartFocus,
            value: _settings.autoStartFocus,
            onChanged: (value) => setState(
              () => _settings = _settings.copyWith(autoStartFocus: value),
            ),
          ),
        ],
      ),
    );
  }
}

class _SwitchSettingRow extends StatelessWidget {
  const _SwitchSettingRow({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.colorScheme.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          shad.Switch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}

class _SliderSetting extends StatelessWidget {
  const _SliderSetting({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
    this.suffix,
  });

  final String label;
  final double value;
  final double min;
  final double max;
  final ValueChanged<double> onChanged;
  final String? suffix;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: theme.typography.small),
              Text(
                suffix != null
                    ? '${value.round()} $suffix'
                    : '${value.round()}',
                style: theme.typography.small.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const shad.Gap(8),
          shad.Slider(
            value: shad.SliderValue.single(value),
            min: min,
            max: max,
            divisions: (max - min).round(),
            onChanged: (v) => onChanged(v.value),
          ),
        ],
      ),
    );
  }
}

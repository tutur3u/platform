import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/l10n/l10n.dart';
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
    final theme = shad.Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: theme.colorScheme.mutedForeground.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const shad.Gap(16),
          Text(
            l10n.timerPomodoroSettings,
            style: theme.typography.h3,
          ),
          const shad.Gap(24),
          _SliderSetting(
            label: l10n.timerFocusTime,
            value: _settings.focusMinutes.toDouble(),
            min: 15,
            max: 60,
            suffix: 'min',
            onChanged: (v) => setState(
              () => _settings = _settings.copyWith(focusMinutes: v.round()),
            ),
          ),
          _SliderSetting(
            label: l10n.timerShortBreak,
            value: _settings.shortBreakMinutes.toDouble(),
            min: 3,
            max: 15,
            suffix: 'min',
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
            suffix: 'min',
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
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(l10n.timerAutoStartBreaks),
              shad.Switch(
                value: _settings.autoStartBreaks,
                onChanged: (v) => setState(
                  () => _settings = _settings.copyWith(autoStartBreaks: v),
                ),
              ),
            ],
          ),
          const shad.Gap(16),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(l10n.timerAutoStartFocus),
              shad.Switch(
                value: _settings.autoStartFocus,
                onChanged: (v) => setState(
                  () => _settings = _settings.copyWith(autoStartFocus: v),
                ),
              ),
            ],
          ),
          const shad.Gap(24),
          shad.PrimaryButton(
            onPressed: () {
              widget.onSave(_settings);
              Navigator.of(context).pop();
            },
            child: Text(l10n.timerSave),
          ),
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

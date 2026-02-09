import 'package:flutter/material.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/l10n/l10n.dart';

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
    final colorScheme = Theme.of(context).colorScheme;

    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.8,
      builder: (context, scrollController) => Container(
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: ListView(
          controller: scrollController,
          padding: const EdgeInsets.all(24),
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: colorScheme.onSurfaceVariant.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              l10n.timerPomodoroSettings,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 24),
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
                () =>
                    _settings = _settings.copyWith(longBreakMinutes: v.round()),
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
            SwitchListTile(
              title: const Text('Auto-start breaks'),
              value: _settings.autoStartBreaks,
              onChanged: (v) => setState(
                () => _settings = _settings.copyWith(autoStartBreaks: v),
              ),
            ),
            SwitchListTile(
              title: const Text('Auto-start focus'),
              value: _settings.autoStartFocus,
              onChanged: (v) => setState(
                () => _settings = _settings.copyWith(autoStartFocus: v),
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () {
                widget.onSave(_settings);
                Navigator.of(context).pop();
              },
              child: Text(l10n.timerSave),
            ),
          ],
        ),
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: Theme.of(context).textTheme.bodyMedium),
              Text(
                suffix != null
                    ? '${value.round()} $suffix'
                    : '${value.round()}',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          Slider(
            value: value,
            min: min,
            max: max,
            divisions: (max - min).round(),
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/settings/view/apps/app_settings_group.dart';
import 'package:mobile/features/settings/view/apps/app_settings_labels.dart';
import 'package:mobile/features/settings/view/apps/timer_threshold_settings.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/time_tracker/widgets/pomodoro_settings_dialog.dart';
import 'package:mobile/l10n/l10n.dart';

export 'package:mobile/data/repositories/time_tracker_threshold_cache.dart'
    show timerStatusChangeGracePeriodConfigId;

/// Timer: device Pomodoro lengths beside the workspace approval threshold.
/// Each group's footer says which scope it changes.
class TimerAppSettings extends StatefulWidget {
  const TimerAppSettings({
    this.repository,
    this.permissionsRepository,
    this.cacheStore,
    this.focusThreshold = false,
    super.key,
  });

  final ITimeTrackerRepository? repository;
  final WorkspacePermissionsRepository? permissionsRepository;
  final CacheStore? cacheStore;

  /// Opens the threshold editor once it is available, for the Requests gear.
  final bool focusThreshold;

  @override
  State<TimerAppSettings> createState() => _TimerAppSettingsState();
}

class _TimerAppSettingsState extends State<TimerAppSettings> {
  late final ITimeTrackerRepository _repository =
      widget.repository ?? TimeTrackerRepository();
  PomodoroSettings? _pomodoro;

  @override
  void initState() {
    super.initState();
    unawaited(_loadPomodoro());
  }

  Future<void> _loadPomodoro() async {
    final settings = await _repository.loadPomodoroSettings();
    if (mounted) setState(() => _pomodoro = settings);
  }

  Future<void> _editPomodoro(PomodoroSettings current) async {
    await showAdaptiveSheet<void>(
      useRootNavigator: true,
      context: context,
      builder: (_) => PomodoroSettingsDialog(
        settings: current,
        onSave: (settings) => unawaited(_savePomodoro(settings)),
      ),
    );
  }

  Future<void> _savePomodoro(PomodoroSettings settings) async {
    await _repository.savePomodoroSettings(settings);
    if (mounted) setState(() => _pomodoro = settings);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final pomodoro = _pomodoro;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSettingsGroup(
          title: l10n.settingsAppFocusGroup,
          footer: l10n.settingsFooterDevice,
          children: [
            SettingsTile(
              key: const ValueKey('settings-pomodoro-row'),
              grouped: true,
              icon: LucideIcons.timer,
              title: l10n.settingsPomodoroTitle,
              value: pomodoro == null
                  ? l10n.commonLoading
                  : pomodoroSummary(pomodoro, l10n),
              onTap: pomodoro == null
                  ? null
                  : () => unawaited(_editPomodoro(pomodoro)),
            ),
          ],
        ),
        TimerThresholdSettings(
          repository: _repository,
          permissionsRepository: widget.permissionsRepository,
          cacheStore: widget.cacheStore,
          openEditorOnLoad: widget.focusThreshold,
        ),
      ],
    );
  }
}

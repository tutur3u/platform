import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/settings/view/product_settings_registry.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// Settings > Apps: one row per app, each with a summary of current values.
class ProductSettingsSection extends StatefulWidget {
  const ProductSettingsSection({
    this.settingsRepository,
    this.timeTrackerRepository,
    super.key,
  });

  final SettingsRepository? settingsRepository;
  final ITimeTrackerRepository? timeTrackerRepository;

  @override
  State<ProductSettingsSection> createState() => _ProductSettingsSectionState();
}

class _ProductSettingsSectionState extends State<ProductSettingsSection> {
  late final SettingsRepository _settings =
      widget.settingsRepository ?? SettingsRepository();
  late final ITimeTrackerRepository _timer =
      widget.timeTrackerRepository ?? TimeTrackerRepository();
  var _summaries = const AppSettingsSummaries();

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final values = await Future.wait<Object>([
        _settings.getDisableDefaultTaskBoardNavigation(),
        _timer.loadPomodoroSettings(),
      ]);
      if (!mounted) return;
      setState(
        () => _summaries = AppSettingsSummaries(
          boardPicker: values[0] as bool,
          pomodoro: values[1] as PomodoroSettings,
        ),
      );
    } on Exception {
      // Rows stay reachable without a summary.
    }
  }

  Future<void> _open(ProductSettingsEntry entry) async {
    await entry.open(context);
    // Values may have changed on the sub-screen.
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    context
      ..watch<AuthCubit>()
      ..watch<WorkspaceCubit>();
    final entries = productSettingsRegistry
        .where((entry) => entry.visible(context))
        .toList();
    if (entries.isEmpty) return const SizedBox.shrink();
    return SettingsCompactSection(
      title: context.l10n.settingsAppsGroup,
      children: [
        for (final entry in entries)
          SettingsTile(
            key: ValueKey(entry.id),
            icon: entry.icon,
            title: entry.title(context),
            value: entry.summary?.call(context, _summaries),
            grouped: true,
            onTap: () => unawaited(_open(entry)),
          ),
      ],
    );
  }
}

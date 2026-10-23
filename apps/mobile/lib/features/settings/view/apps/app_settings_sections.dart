import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/view/apps/app_settings_group.dart';
import 'package:mobile/features/settings/view/apps/app_settings_labels.dart';
import 'package:mobile/features/settings/view/product_preference_editors.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

export 'package:mobile/features/settings/view/apps/calendar_app_settings.dart';

/// Tasks: how Boards opens. Stored on the device by [SettingsRepository].
class TasksAppSettings extends StatefulWidget {
  const TasksAppSettings({this.settingsRepository, super.key});

  final SettingsRepository? settingsRepository;

  @override
  State<TasksAppSettings> createState() => _TasksAppSettingsState();
}

class _TasksAppSettingsState extends State<TasksAppSettings> {
  late final SettingsRepository _settings =
      widget.settingsRepository ?? SettingsRepository();
  bool? _boardPicker;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final value = await _settings.getDisableDefaultTaskBoardNavigation();
    if (mounted) setState(() => _boardPicker = value);
  }

  Future<void> _choose(bool current) async {
    final selected = await openTaskBoardNavigationSettings(
      context,
      boardPicker: current,
    );
    if (selected == null || !mounted || selected == current) return;
    await _settings.setDisableDefaultTaskBoardNavigation(value: selected);
    if (mounted) setState(() => _boardPicker = selected);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final current = _boardPicker;
    return AppSettingsGroup(
      title: l10n.settingsAppBoardsGroup,
      footer: l10n.settingsFooterDevice,
      children: [
        SettingsTile(
          key: const ValueKey('settings-task-board-row'),
          grouped: true,
          icon: shad.LucideIcons.squareKanban,
          title: l10n.settingsDefaultTaskBoardNavigation,
          value: taskBoardNavigationLabel(l10n, boardPicker: current),
          onTap: current == null ? null : () => unawaited(_choose(current)),
        ),
      ],
    );
  }
}

/// Finance: amount visibility, shared with the eye action on finance pages.
class FinanceAppSettings extends StatelessWidget {
  const FinanceAppSettings({super.key});

  @override
  Widget build(BuildContext context) {
    final cubit = context.watch<FinancePreferencesCubit?>();
    if (cubit == null) return const SizedBox.shrink();
    final l10n = context.l10n;
    return AppSettingsGroup(
      title: l10n.settingsAppPrivacyGroup,
      footer: l10n.settingsFooterDevice,
      children: [
        SettingsTile(
          key: const ValueKey('settings-finance-row'),
          grouped: true,
          icon: shad.LucideIcons.eye,
          title: l10n.settingsFinanceAmounts,
          value: financeAmountsLabel(
            l10n,
            showAmounts: cubit.state.showAmounts,
          ),
          onTap: () => unawaited(openFinanceProductSettings(context, cubit)),
        ),
      ],
    );
  }
}

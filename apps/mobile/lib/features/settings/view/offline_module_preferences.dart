import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/settings/view/timezone_settings_tile.dart';
import 'package:mobile/l10n/l10n.dart';

class OfflineModulePreferences extends StatefulWidget {
  const OfflineModulePreferences({
    required this.moduleId,
    required this.userId,
    required this.workspaceId,
    super.key,
  });
  final String moduleId;
  final String userId;
  final String workspaceId;
  @override
  State<OfflineModulePreferences> createState() =>
      _OfflineModulePreferencesState();
}

class _OfflineModulePreferencesState extends State<OfflineModulePreferences> {
  final _settings = SettingsRepository();
  bool? _boardPicker;
  @override
  void initState() {
    super.initState();
    if (widget.moduleId == 'tasks') unawaited(_loadBoardPreference());
  }

  Future<void> _loadBoardPreference() async {
    final value = await _settings.getDisableDefaultTaskBoardNavigation();
    if (mounted) setState(() => _boardPicker = value);
  }

  Future<void> _choose({required bool finance, required bool value}) async {
    final cubit = context.read<FinancePreferencesCubit?>();
    final selected = await showSettingsChoiceDialog<bool>(
      context: context,
      title: finance
          ? context.l10n.settingsFinanceAmounts
          : context.l10n.settingsDefaultTaskBoardNavigation,
      currentValue: value,
      options: [
        SettingsChoiceOption(
          value: true,
          label: finance
              ? context.l10n.financeShowAmounts
              : context.l10n.settingsDefaultTaskBoardNavigationBoardPicker,
          icon: finance ? Icons.visibility_outlined : Icons.dashboard_outlined,
        ),
        SettingsChoiceOption(
          value: false,
          label: finance
              ? context.l10n.financeHideAmounts
              : context.l10n.settingsDefaultTaskBoardNavigationDefaultBoard,
          icon: finance
              ? Icons.visibility_off_outlined
              : Icons.view_kanban_outlined,
        ),
      ],
    );
    if (!mounted || selected == null || selected == value) return;
    if (finance) {
      await cubit?.setShowAmounts(value: selected);
    } else {
      await _settings.setDisableDefaultTaskBoardNavigation(value: selected);
      if (mounted) setState(() => _boardPicker = selected);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final finance = context.watch<FinancePreferencesCubit?>();
    final rows = <Widget>[
      if (widget.moduleId == 'finance' && finance != null)
        SettingsTile(
          grouped: true,
          icon: Icons.visibility_outlined,
          title: l10n.settingsFinanceAmounts,
          value: finance.state.showAmounts
              ? l10n.financeShowAmounts
              : l10n.financeHideAmounts,
          onTap: () => unawaited(
            _choose(finance: true, value: finance.state.showAmounts),
          ),
        ),
      if (widget.moduleId == 'tasks')
        SettingsTile(
          grouped: true,
          icon: Icons.view_kanban_outlined,
          title: l10n.settingsDefaultTaskBoardNavigation,
          value: _boardPicker == null
              ? l10n.commonLoading
              : _boardPicker!
              ? l10n.settingsDefaultTaskBoardNavigationBoardPicker
              : l10n.settingsDefaultTaskBoardNavigationDefaultBoard,
          onTap: _boardPicker == null
              ? null
              : () => unawaited(_choose(finance: false, value: _boardPicker!)),
        ),
      if (widget.moduleId == 'calendar')
        TimezoneSettingsTile(
          userId: widget.userId,
          workspaceId: widget.workspaceId,
          grouped: true,
        ),
    ];
    if (rows.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 20),
      child: SettingsCompactSection(
        title: l10n.settingsAppPreferences,
        children: rows,
      ),
    );
  }
}

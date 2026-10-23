import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/calendar/widgets/calendar_connections_sheet.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/view/apps/app_settings_labels.dart';
import 'package:mobile/features/settings/view/product_preference_editors.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
    return SettingsCompactSection(
      title: l10n.settingsAppBoardsGroup,
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

/// Calendar: week start and connected calendar accounts.
class CalendarAppSettings extends StatefulWidget {
  const CalendarAppSettings({super.key});

  @override
  State<CalendarAppSettings> createState() => _CalendarAppSettingsState();
}

class _CalendarAppSettingsState extends State<CalendarAppSettings> {
  @override
  void initState() {
    super.initState();
    final workspaceId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    final cubit = context.read<CalendarSettingsCubit?>();
    if (workspaceId != null && cubit != null) {
      // A deep link can land here before Settings resolved the default.
      unawaited(cubit.loadWorkspacePreference(workspaceId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final calendar = context.watch<CalendarSettingsCubit?>();
    final workspaceId = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (calendar != null)
          SettingsCompactSection(
            title: l10n.settingsAppWeekGroup,
            children: [
              SettingsTile(
                key: const ValueKey('settings-first-day-row'),
                grouped: true,
                icon: shad.LucideIcons.calendar,
                title: l10n.settingsFirstDayOfWeek,
                value: calendarFirstDayLabel(calendar.state, l10n),
                onTap: () => unawaited(openCalendarProductSettings(context)),
              ),
            ],
          ),
        if (Env.isCalendarIntegrationsEnabled && workspaceId != null) ...[
          const SizedBox(height: SettingsRowLayout.groupGap),
          SettingsCompactSection(
            title: l10n.settingsAppConnectionsGroup,
            children: [
              SettingsTile(
                key: const ValueKey('settings-calendar-connections-row'),
                grouped: true,
                icon: shad.LucideIcons.link,
                title: l10n.calendarConnectionsTitle,
                onTap: () => unawaited(
                  showCalendarConnectionsSheet(context, wsId: workspaceId),
                ),
              ),
            ],
          ),
        ],
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
    return SettingsCompactSection(
      title: l10n.settingsAppPrivacyGroup,
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

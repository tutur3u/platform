import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/calendar/widgets/calendar_connections_sheet.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/settings/view/apps/app_settings_group.dart';
import 'package:mobile/features/settings/view/apps/app_settings_labels.dart';
import 'package:mobile/features/settings/view/product_preference_editors.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_search.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

/// Calendar: week start, a link to the shared time zones and connected
/// calendar accounts.
class CalendarAppSettings extends StatefulWidget {
  const CalendarAppSettings({super.key});

  @override
  State<CalendarAppSettings> createState() => _CalendarAppSettingsState();
}

class _CalendarAppSettingsState extends State<CalendarAppSettings> {
  @override
  void initState() {
    super.initState();
    // A deep link can land here before Settings resolved the default.
    _loadWorkspaceDefault(
      context.read<WorkspaceCubit>().state.currentWorkspace?.id,
    );
  }

  void _loadWorkspaceDefault(String? workspaceId) {
    final cubit = context.read<CalendarSettingsCubit?>();
    if (workspaceId != null && cubit != null) {
      unawaited(cubit.loadWorkspacePreference(workspaceId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final calendar = context.watch<CalendarSettingsCubit?>();
    final zone = context.watch<TimezoneSettingsCubit?>()?.state.personal;
    final workspaceId = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    return BlocListener<WorkspaceCubit, WorkspaceState>(
      // The "Auto" summary falls back to the workspace default; keep it for
      // the workspace now in scope.
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (_, state) => _loadWorkspaceDefault(state.currentWorkspace?.id),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppSettingsGroup(
            title: l10n.settingsAppWeekGroup,
            footer: l10n.settingsFooterFirstDay,
            children: [
              if (calendar != null)
                SettingsTile(
                  key: const ValueKey('settings-first-day-row'),
                  grouped: true,
                  icon: LucideIcons.calendar,
                  title: l10n.settingsFirstDayOfWeek,
                  value: calendarFirstDayLabel(calendar.state, l10n),
                  subtitle: calendar.state.isFromCache
                      ? l10n.settingsDataStatusCached
                      : null,
                  onTap: calendar.state.saving || calendar.state.revalidating
                      ? null
                      : () => unawaited(openCalendarProductSettings(context)),
                ),
              if (calendar?.state.error != null)
                SettingsTile(
                  key: const ValueKey('settings-calendar-error'),
                  grouped: true,
                  icon: LucideIcons.circleAlert,
                  title: l10n.calendarSettingsError,
                  wrapSupportingText: true,
                  showChevron: false,
                  trailing: AppIconButton(
                    tooltip: l10n.commonRetry,
                    onPressed: calendar!.state.loading || calendar.state.saving
                        ? null
                        : () => unawaited(calendar.loadUserPreference()),
                    icon: const Icon(LucideIcons.rotateCw),
                  ),
                ),
              SettingsTile(
                key: const ValueKey('settings-calendar-timezone-row'),
                grouped: true,
                icon: LucideIcons.earth,
                title: l10n.settingsTimeZoneGroup,
                value: zone == null || zone == 'auto'
                    ? l10n.settingsFirstDayAuto
                    : zone,
                onTap: () {
                  // Time zones are shared by every app; open them in place.
                  settingsFocusRequest.value = 'time-zone';
                  context.go(Routes.settings);
                },
              ),
            ],
          ),
          if (Env.isCalendarIntegrationsEnabled && workspaceId != null) ...[
            const SizedBox(height: SettingsRowLayout.groupGap),
            AppSettingsGroup(
              title: l10n.settingsAppConnectionsGroup,
              footer: l10n.settingsFooterCalendarAccounts,
              children: [
                SettingsTile(
                  key: const ValueKey('settings-calendar-connections-row'),
                  grouped: true,
                  icon: LucideIcons.link,
                  title: l10n.calendarConnectionsTitle,
                  onTap: () => unawaited(
                    showCalendarConnectionsSheet(context, wsId: workspaceId),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

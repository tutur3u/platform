part of 'settings_page.dart';

class _PreferencesSection extends StatelessWidget {
  const _PreferencesSection({
    required this.permissionsRepository,
    required this.permissionsRevision,
    required this.appearanceTheme,
    required this.appearanceSummary,
    required this.showFinanceAmounts,
    required this.languageLabel,
    required this.calendarLabel,
    required this.disableDefaultTaskBoardNavigation,
    required this.onChangeLanguage,
    required this.onToggleFinanceAmounts,
    required this.onToggleDefaultTaskBoardNavigation,
    required this.onOpenAppearance,
    required this.onChangeFirstDayOfWeek,
    required this.hapticsEnabled,
    required this.onToggleHaptics,
  });

  final WorkspacePermissionsRepository permissionsRepository;
  final int permissionsRevision;
  final String appearanceTheme;
  final String appearanceSummary;
  final bool showFinanceAmounts;
  final String languageLabel;
  final String calendarLabel;
  final bool disableDefaultTaskBoardNavigation;
  final VoidCallback onChangeLanguage;
  final VoidCallback onToggleFinanceAmounts;
  final VoidCallback onToggleDefaultTaskBoardNavigation;
  final VoidCallback onOpenAppearance;
  final VoidCallback onChangeFirstDayOfWeek;
  final bool hapticsEnabled;
  final VoidCallback onToggleHaptics;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    final auth = context.watch<AuthCubit?>();
    final userId = auth == null ? currentCacheUserId() : auth.state.user?.id;
    final workspaceId = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    final personalZone = TimezoneSettingsTile(
      userId: userId,
      workspaceId: workspaceId,
      grouped: true,
    );
    final appearance = SettingsTile(
      key: const ValueKey('settings-appearance-row'),
      grouped: true,
      icon: Icons.palette_outlined,
      title: l10n.settingsAppearance,
      value: appearanceSummary,
      trailingValue: appearanceTheme,
      onTap: onOpenAppearance,
    );
    final language = SettingsTile(
      grouped: true,
      icon: Icons.language_rounded,
      title: l10n.settingsLanguage,
      value: languageLabel,
      onTap: onChangeLanguage,
    );
    final finance = SettingsTile(
      key: const ValueKey('settings-finance-row'),
      grouped: true,
      icon: Icons.visibility_outlined,
      title: l10n.settingsFinanceAmounts,
      value: showFinanceAmounts
          ? l10n.financeShowAmounts
          : l10n.financeHideAmounts,
      onTap: onToggleFinanceAmounts,
    );
    final calendar = SettingsTile(
      grouped: true,
      icon: Icons.calendar_today_outlined,
      title: l10n.settingsFirstDayOfWeek,
      value: calendarLabel,
      onTap: onChangeFirstDayOfWeek,
    );
    final notifications = SettingsTile(
      grouped: true,
      icon: Icons.notifications_active_outlined,
      title: l10n.remindersTitle,
      onTap: () => context.push(Routes.settingsReminders),
    );
    final interaction = SettingsTile(
      key: const ValueKey('settings-haptics-row'),
      grouped: true,
      icon: Icons.vibration_rounded,
      title: l10n.settingsHaptics,
      value: hapticsEnabled ? l10n.commonOn : l10n.commonOff,
      onTap: onToggleHaptics,
    );
    final tasks = SettingsTile(
      key: const ValueKey('settings-task-board-row'),
      grouped: true,
      icon: Icons.view_kanban_outlined,
      title: l10n.taskBoardsTitle,
      value: disableDefaultTaskBoardNavigation
          ? l10n.settingsDefaultTaskBoardNavigationBoardPicker
          : l10n.settingsDefaultTaskBoardNavigationDefaultBoard,
      onTap: onToggleDefaultTaskBoardNavigation,
    );
    final workspaceZone = workspaceId == null
        ? null
        : WorkspaceTimezoneSettingsTile(
            userId: userId,
            workspaceId: workspaceId,
            permissionsRepository: permissionsRepository,
            refreshRevision: permissionsRevision,
            grouped: true,
          );
    final groups = [
      (l10n.settingsAppearanceLanguage, [appearance, language]),
      (
        l10n.settingsCalendarTimezone,
        [personalZone, if (workspaceZone != null) workspaceZone, calendar],
      ),
      (l10n.settingsNotificationsInteraction, [notifications, interaction]),
      (
        l10n.settingsAppPreferences,
        [finance, tasks, const LinkBrowserSettingsTile()],
      ),
    ];
    final sections = [
      for (final group in groups)
        SettingsCompactSection(title: group.$1, children: group.$2),
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        Widget column(List<Widget> widgets) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (var index = 0; index < widgets.length; index++) ...[
              if (index > 0) const SizedBox(height: SettingsRowLayout.groupGap),
              widgets[index],
            ],
          ],
        );
        return constraints.maxWidth >= 840
            ? Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: column(sections.take(2).toList())),
                  const SizedBox(width: SettingsRowLayout.groupGap),
                  Expanded(child: column(sections.skip(2).toList())),
                ],
              )
            : column(sections);
      },
    );
  }
}

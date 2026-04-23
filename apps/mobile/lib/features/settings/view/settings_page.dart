import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/cubit/profile_state.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/staggered_entry.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) {
        final cubit = ProfileCubit(
          profileRepository: ProfileRepository(
            ownsApiClient: true,
            ownsHttpClient: true,
          ),
        );
        unawaited(cubit.loadProfile());
        return cubit;
      },
      child: const _SettingsView(),
    );
  }
}

class _SettingsView extends StatefulWidget {
  const _SettingsView();

  @override
  State<_SettingsView> createState() => _SettingsViewState();
}

class _SettingsViewState extends State<_SettingsView> {
  late final Future<PackageInfo> _packageInfoFuture;
  late final WorkspacePermissionsRepository _workspacePermissionsRepository;
  String? _loadedWorkspaceId;
  bool _canManageMobileVersions = false;
  String? _mobileVersionsAccessWorkspaceId;
  int _mobileVersionsAccessLoadToken = 0;

  @override
  void initState() {
    super.initState();
    _workspacePermissionsRepository = WorkspacePermissionsRepository();
    _packageInfoFuture = PackageInfo.fromPlatform();
    final workspaceId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    if (workspaceId != null) {
      unawaited(_loadWorkspaceCalendarPreference(workspaceId));
    }
    unawaited(_loadMobileVersionsAccess(workspaceId, forceReload: true));
  }

  @override
  Widget build(BuildContext context) {
    final horizontalPadding = ResponsivePadding.horizontal(
      context.deviceClass,
    );
    return MultiBlocListener(
      listeners: [
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.currentWorkspace?.id != current.currentWorkspace?.id,
          listener: (context, state) {
            final workspaceId = state.currentWorkspace?.id;
            if (workspaceId != null) {
              unawaited(_loadWorkspaceCalendarPreference(workspaceId));
            }
            unawaited(_loadMobileVersionsAccess(workspaceId));
          },
        ),
        BlocListener<ProfileCubit, ProfileState>(
          listenWhen: (previous, current) =>
              previous.profile != current.profile ||
              previous.lastUpdatedAt != current.lastUpdatedAt,
          listener: (context, state) {
            final profile = state.profile;
            if (profile == null) {
              return;
            }
            unawaited(
              context.read<ShellProfileCubit>().applyExternalProfile(
                profile,
                lastUpdatedAt: state.lastUpdatedAt,
                isFromCache: state.isFromCache,
              ),
            );
          },
        ),
      ],
      child: shad.Scaffold(
        child: FutureBuilder<PackageInfo>(
          future: _packageInfoFuture,
          builder: (context, snapshot) {
            final packageInfo = snapshot.data;
            final financePreferencesCubit = context
                .watch<FinancePreferencesCubit?>();

            return RefreshIndicator.adaptive(
              onRefresh: () => _refresh(context),
              child: ResponsiveWrapper(
                maxWidth: ResponsivePadding.maxContentWidth(
                  context.deviceClass,
                ),
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(
                    parent: BouncingScrollPhysics(),
                  ),
                  padding: EdgeInsets.fromLTRB(
                    horizontalPadding,
                    20,
                    horizontalPadding,
                    32,
                  ),
                  children: [
                    StaggeredEntry(
                      index: 0,
                      playOnceKey: 'settings-hero',
                      child: BlocBuilder<ProfileCubit, ProfileState>(
                        builder: (context, profileState) {
                          return _SettingsHeroCard(
                            isRefreshing: profileState.isRefreshing,
                          );
                        },
                      ),
                    ),
                    const shad.Gap(32),
                    StaggeredEntry(
                      index: 1,
                      playOnceKey: 'settings-preferences',
                      child: _PreferencesSection(
                        themeLabel: _themeDisplayName(
                          context.watch<ThemeCubit>().state.themeMode,
                          context.l10n,
                        ),
                        showFinanceAmounts:
                            financePreferencesCubit?.state.showAmounts ?? false,
                        languageLabel: _localeDisplayName(
                          Localizations.localeOf(context),
                          context.read<LocaleCubit>().state.locale,
                          context.l10n,
                        ),
                        calendarLabel: _calendarDisplayName(
                          context.watch<CalendarSettingsCubit>().state,
                          context.l10n,
                        ),
                        onChangeLanguage: () =>
                            unawaited(_showLanguageDialog()),
                        onToggleFinanceAmounts: () {
                          if (financePreferencesCubit == null) {
                            return;
                          }
                          unawaited(
                            financePreferencesCubit.toggleShowAmounts(),
                          );
                        },
                        onChangeTheme: () => unawaited(_showThemeDialog()),
                        onChangeFirstDayOfWeek: () =>
                            unawaited(_showCalendarDialog()),
                      ),
                    ),
                    if (_canManageMobileVersions) ...[
                      const shad.Gap(32),
                      StaggeredEntry(
                        index: 2,
                        playOnceKey: 'settings-infrastructure',
                        child: SettingsSection(
                          title:
                              context.l10n.settingsInfrastructureSectionTitle,
                          description: context
                              .l10n
                              .settingsInfrastructureSectionDescription,
                          children: [
                            SettingsTile(
                              icon: Icons.system_update_alt_rounded,
                              title: context.l10n.settingsMobileVersions,
                              subtitle: context
                                  .l10n
                                  .settingsMobileVersionsTileDescription,
                              onTap: () =>
                                  context.push(Routes.settingsMobileVersions),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const shad.Gap(32),
                    StaggeredEntry(
                      index: _canManageMobileVersions ? 3 : 2,
                      playOnceKey: 'settings-about',
                      child: _AboutSection(packageInfo: packageInfo),
                    ),
                    const shad.Gap(32),
                    StaggeredEntry(
                      index: _canManageMobileVersions ? 4 : 3,
                      playOnceKey: 'settings-danger',
                      child: SettingsSection(
                        title: context.l10n.settingsDangerSectionTitle,
                        description:
                            context.l10n.settingsDangerSectionDescription,
                        children: [
                          SettingsTile(
                            icon: Icons.logout_rounded,
                            title: context.l10n.authLogOutCurrent,
                            subtitle: context.l10n.authLogOutCurrentDescription,
                            isDestructive: true,
                            onTap: () => unawaited(_showSignOutDialog()),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  String _calendarDisplayName(
    CalendarSettingsState state,
    AppLocalizations l10n,
  ) {
    final effective = state.userPreference != FirstDayOfWeek.auto_
        ? state.userPreference
        : state.workspacePreference != FirstDayOfWeek.auto_
        ? state.workspacePreference
        : FirstDayOfWeek.auto_;

    switch (effective) {
      case FirstDayOfWeek.auto_:
        return l10n.settingsFirstDayAuto;
      case FirstDayOfWeek.sunday:
        return l10n.settingsFirstDaySunday;
      case FirstDayOfWeek.monday:
        return l10n.settingsFirstDayMonday;
      case FirstDayOfWeek.saturday:
        return l10n.settingsFirstDaySaturday;
    }
  }

  String _localeDisplayName(
    Locale systemLocale,
    Locale? selectedLocale,
    AppLocalizations l10n,
  ) {
    final locale = selectedLocale ?? systemLocale;
    switch (locale.languageCode) {
      case 'en':
        return selectedLocale == null
            ? '${l10n.settingsLanguageSystem} · ${l10n.settingsLanguageEnglish}'
            : l10n.settingsLanguageEnglish;
      case 'vi':
        return selectedLocale == null
            ? '${l10n.settingsLanguageSystem} · '
                  '${l10n.settingsLanguageVietnamese}'
            : l10n.settingsLanguageVietnamese;
      default:
        return selectedLocale == null
            ? '${l10n.settingsLanguageSystem} · ${locale.languageCode}'
            : locale.languageCode;
    }
  }

  Future<void> _loadWorkspaceCalendarPreference(String workspaceId) async {
    if (_loadedWorkspaceId == workspaceId) {
      return;
    }

    _loadedWorkspaceId = workspaceId;
    await context.read<CalendarSettingsCubit>().loadWorkspacePreference(
      workspaceId,
    );
  }

  Future<void> _loadMobileVersionsAccess(
    String? workspaceId, {
    bool forceReload = false,
  }) async {
    if (!forceReload && _mobileVersionsAccessWorkspaceId == workspaceId) {
      return;
    }

    _mobileVersionsAccessWorkspaceId = workspaceId;
    final requestToken = ++_mobileVersionsAccessLoadToken;

    if (workspaceId == null || !isSystemWorkspaceId(workspaceId)) {
      if (!mounted || requestToken != _mobileVersionsAccessLoadToken) {
        return;
      }
      setState(() => _canManageMobileVersions = false);
      return;
    }

    final permissions = await _workspacePermissionsRepository.getPermissions(
      wsId: rootWorkspaceId,
    );

    if (!mounted || requestToken != _mobileVersionsAccessLoadToken) {
      return;
    }

    setState(
      () => _canManageMobileVersions = permissions.containsPermission(
        manageWorkspaceRolesPermission,
      ),
    );
  }

  Future<void> _refresh(BuildContext context) async {
    final workspaceCubit = context.read<WorkspaceCubit>();
    final calendarCubit = context.read<CalendarSettingsCubit>();
    final currentWorkspaceId = workspaceCubit.state.currentWorkspace?.id;

    await Future.wait([
      context.read<ProfileCubit>().loadProfile(forceRefresh: true),
      workspaceCubit.loadWorkspaces(forceRefresh: true),
      workspaceCubit.refreshLimits(),
      calendarCubit.loadUserPreference(),
      _loadMobileVersionsAccess(currentWorkspaceId, forceReload: true),
      if (currentWorkspaceId != null)
        calendarCubit.loadWorkspacePreference(currentWorkspaceId),
    ]);
  }

  Future<void> _showCalendarDialog() async {
    final l10n = context.l10n;
    final cubit = context.read<CalendarSettingsCubit>();
    final selected = await showSettingsChoiceDialog<FirstDayOfWeek>(
      context: context,
      title: l10n.settingsFirstDayOfWeek,
      description: l10n.settingsFirstDayOfWeekDescription,
      currentValue: cubit.state.userPreference,
      options: [
        SettingsChoiceOption(
          value: FirstDayOfWeek.auto_,
          label: l10n.settingsFirstDayAuto,
          icon: Icons.auto_mode_rounded,
          description: l10n.settingsFirstDayAutoDescription,
        ),
        SettingsChoiceOption(
          value: FirstDayOfWeek.monday,
          label: l10n.settingsFirstDayMonday,
          icon: Icons.calendar_view_week_rounded,
        ),
        SettingsChoiceOption(
          value: FirstDayOfWeek.sunday,
          label: l10n.settingsFirstDaySunday,
          icon: Icons.view_week_rounded,
        ),
        SettingsChoiceOption(
          value: FirstDayOfWeek.saturday,
          label: l10n.settingsFirstDaySaturday,
          icon: Icons.event_repeat_rounded,
        ),
      ],
    );

    if (selected != null && mounted) {
      await cubit.setFirstDayOfWeek(selected);
    }
  }

  Future<void> _showLanguageDialog() async {
    final l10n = context.l10n;
    final cubit = context.read<LocaleCubit>();
    final currentValue = cubit.state.locale?.languageCode ?? 'system';

    final selected = await showSettingsChoiceDialog<String>(
      context: context,
      title: l10n.settingsLanguage,
      description: l10n.settingsLanguageDescription,
      currentValue: currentValue,
      options: [
        SettingsChoiceOption(
          value: 'system',
          label: l10n.settingsLanguageSystem,
          icon: Icons.settings_suggest_rounded,
          description: l10n.settingsLanguageSystemDescription,
        ),
        SettingsChoiceOption(
          value: 'en',
          label: l10n.settingsLanguageEnglish,
          icon: Icons.translate_rounded,
        ),
        SettingsChoiceOption(
          value: 'vi',
          label: l10n.settingsLanguageVietnamese,
          icon: Icons.translate_rounded,
        ),
      ],
    );

    if (selected == null || !mounted) {
      return;
    }

    if (selected == 'system') {
      await cubit.clearLocale();
      return;
    }

    await cubit.setLocale(Locale(selected));
  }

  Future<void> _showSignOutDialog() async {
    final authCubit = context.read<AuthCubit>();
    final confirmed = await showSettingsConfirmationDialog(
      context: context,
      title: context.l10n.authLogOutConfirmDialogTitle,
      description: context.l10n.authLogOutConfirmDialogBody,
      confirmLabel: context.l10n.authLogOut,
      isDestructive: true,
    );

    if (confirmed == true && context.mounted) {
      await authCubit.signOutCurrentAccount();
    }
  }

  Future<void> _showThemeDialog() async {
    final l10n = context.l10n;
    final cubit = context.read<ThemeCubit>();

    final selected = await showSettingsChoiceDialog<shad.ThemeMode>(
      context: context,
      title: l10n.settingsTheme,
      description: l10n.settingsThemeDescription,
      currentValue: cubit.state.themeMode,
      options: [
        SettingsChoiceOption(
          value: shad.ThemeMode.system,
          label: l10n.settingsThemeSystem,
          icon: Icons.brightness_auto_rounded,
          description: l10n.settingsThemeSystemDescription,
        ),
        SettingsChoiceOption(
          value: shad.ThemeMode.light,
          label: l10n.settingsThemeLight,
          icon: Icons.light_mode_rounded,
        ),
        SettingsChoiceOption(
          value: shad.ThemeMode.dark,
          label: l10n.settingsThemeDark,
          icon: Icons.dark_mode_rounded,
        ),
      ],
    );

    if (selected != null && mounted) {
      await cubit.setThemeMode(selected);
    }
  }

  String _themeDisplayName(shad.ThemeMode mode, AppLocalizations l10n) {
    switch (mode) {
      case shad.ThemeMode.light:
        return l10n.settingsThemeLight;
      case shad.ThemeMode.dark:
        return l10n.settingsThemeDark;
      case shad.ThemeMode.system:
        return l10n.settingsThemeSystem;
    }
  }
}

class _AboutSection extends StatelessWidget {
  const _AboutSection({required this.packageInfo});

  final PackageInfo? packageInfo;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return SettingsSection(
      title: l10n.settingsAboutSectionTitle,
      description: l10n.settingsAboutSectionDescription,
      children: [
        SettingsTile(
          icon: Icons.info_outline_rounded,
          title: l10n.settingsAppVersion,
          value: _formatVersionLabel(packageInfo),
          subtitle: l10n.settingsVersionTileDescription,
          showChevron: false,
        ),
      ],
    );
  }
}

class _PreferencesSection extends StatelessWidget {
  const _PreferencesSection({
    required this.themeLabel,
    required this.showFinanceAmounts,
    required this.languageLabel,
    required this.calendarLabel,
    required this.onChangeLanguage,
    required this.onToggleFinanceAmounts,
    required this.onChangeTheme,
    required this.onChangeFirstDayOfWeek,
  });

  final String themeLabel;
  final bool showFinanceAmounts;
  final String languageLabel;
  final String calendarLabel;
  final VoidCallback onChangeLanguage;
  final VoidCallback onToggleFinanceAmounts;
  final VoidCallback onChangeTheme;
  final VoidCallback onChangeFirstDayOfWeek;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return SettingsSection(
      title: l10n.settingsPreferencesSectionTitle,
      description: l10n.settingsPreferencesSectionDescription,
      children: [
        SettingsTile(
          icon: Icons.palette_outlined,
          title: l10n.settingsTheme,
          subtitle: l10n.settingsThemeDescription,
          value: themeLabel,
          onTap: onChangeTheme,
        ),
        SettingsTile(
          icon: Icons.language_rounded,
          title: l10n.settingsLanguage,
          subtitle: l10n.settingsLanguageDescription,
          value: languageLabel,
          onTap: onChangeLanguage,
        ),
        SettingsTile(
          icon: Icons.visibility_outlined,
          title: l10n.settingsFinanceAmounts,
          subtitle: l10n.settingsFinanceAmountsDescription,
          value: showFinanceAmounts
              ? l10n.financeShowAmounts
              : l10n.financeHideAmounts,
          onTap: onToggleFinanceAmounts,
          showChevron: false,
          trailing: IgnorePointer(
            child: shad.Switch(
              value: showFinanceAmounts,
              onChanged: (_) {},
            ),
          ),
        ),
        SettingsTile(
          icon: Icons.calendar_today_outlined,
          title: l10n.settingsFirstDayOfWeek,
          subtitle: l10n.settingsFirstDayOfWeekDescription,
          value: calendarLabel,
          onTap: onChangeFirstDayOfWeek,
        ),
      ],
    );
  }
}

class _SettingsHeroCard extends StatelessWidget {
  const _SettingsHeroCard({
    required this.isRefreshing,
  });

  final bool isRefreshing;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: LinearGradient(
          colors: [
            theme.colorScheme.primary.withValues(alpha: 0.18),
            theme.colorScheme.card,
            theme.colorScheme.secondary.withValues(alpha: 0.16),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.7),
        ),
      ),
      padding: const EdgeInsets.all(22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 58,
                height: 58,
                decoration: BoxDecoration(
                  color: theme.colorScheme.background.withValues(alpha: 0.92),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: theme.colorScheme.border.withValues(alpha: 0.72),
                  ),
                ),
                alignment: Alignment.center,
                child: Icon(
                  Icons.tune_rounded,
                  size: 26,
                  color: theme.colorScheme.primary,
                ),
              ),
              const shad.Gap(14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.settingsTitle,
                      style: theme.typography.h3.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const shad.Gap(6),
                    Text(
                      l10n.settingsHeroDescription,
                      style: theme.typography.textSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                        height: 1.45,
                      ),
                    ),
                  ],
                ),
              ),
              if (isRefreshing)
                const SizedBox.square(
                  dimension: 16,
                  child: shad.CircularProgressIndicator(),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

String _formatVersionLabel(PackageInfo? packageInfo) {
  if (packageInfo == null) {
    return '...';
  }

  final buildNumber = packageInfo.buildNumber.trim();
  if (buildNumber.isEmpty) {
    return packageInfo.version;
  }

  return '${packageInfo.version} ($buildNumber)';
}

import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/profile_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/onboarding/view/onboarding_page.dart';
import 'package:mobile/features/profile/cubit/profile_cubit.dart';
import 'package:mobile/features/profile/cubit/profile_state.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/view/cache_storage_sheet.dart';
import 'package:mobile/features/settings/view/internal_accounts_page.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/features/settings/view/settings_session_section.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/staggered_entry.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'settings_page_widgets.dart';

enum SettingsSectionDestination {
  overview,
  preferences,
  experiments,
  infrastructure,
  about,
  session,
}

class SettingsPage extends StatelessWidget {
  const SettingsPage({
    super.key,
    this.section = SettingsSectionDestination.overview,
  });

  final SettingsSectionDestination section;

  @override
  Widget build(BuildContext context) {
    if (section != SettingsSectionDestination.overview) {
      return _SettingsView(section: section);
    }
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
      child: _SettingsView(section: section),
    );
  }
}

class _SettingsView extends StatefulWidget {
  const _SettingsView({required this.section});

  final SettingsSectionDestination section;

  @override
  State<_SettingsView> createState() => _SettingsViewState();
}

class _SettingsViewState extends State<_SettingsView> {
  Future<PackageInfo>? _packageInfoFuture;
  late final SettingsRepository _settingsRepository;
  late final WorkspacePermissionsRepository _workspacePermissionsRepository;
  String? _loadedWorkspaceId;
  bool _disableDefaultTaskBoardNavigation = false;
  bool _canManageMobileVersions = false;
  String? _mobileVersionsAccessWorkspaceId;
  int _mobileVersionsAccessLoadToken = 0;

  @override
  void initState() {
    super.initState();
    _settingsRepository = SettingsRepository();
    _workspacePermissionsRepository = WorkspacePermissionsRepository();
    if (widget.section == SettingsSectionDestination.about) {
      _packageInfoFuture = PackageInfo.fromPlatform();
    }
    final workspaceId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    if (widget.section == SettingsSectionDestination.preferences &&
        workspaceId != null) {
      unawaited(_loadWorkspaceCalendarPreference(workspaceId));
    }
    if (widget.section == SettingsSectionDestination.preferences) {
      unawaited(_loadDefaultTaskBoardNavigationPreference());
    }
    if (widget.section == SettingsSectionDestination.overview) {
      unawaited(_loadMobileVersionsAccess(workspaceId, forceReload: true));
    }
  }

  @override
  Widget build(BuildContext context) {
    final horizontalPadding = ResponsivePadding.horizontal(context.deviceClass);
    return MultiBlocListener(
      listeners: [
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.currentWorkspace?.id != current.currentWorkspace?.id,
          listener: (context, state) {
            final workspaceId = state.currentWorkspace?.id;
            if (widget.section == SettingsSectionDestination.preferences &&
                workspaceId != null) {
              unawaited(_loadWorkspaceCalendarPreference(workspaceId));
            }
            if (widget.section == SettingsSectionDestination.overview) {
              unawaited(_loadMobileVersionsAccess(workspaceId));
            }
          },
        ),
        if (widget.section == SettingsSectionDestination.overview)
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
            final financePreferencesCubit =
                widget.section == SettingsSectionDestination.preferences
                ? context.watch<FinancePreferencesCubit?>()
                : null;
            final experimentalAppsState =
                widget.section == SettingsSectionDestination.experiments
                ? context.watch<ExperimentalAppsCubit?>()?.state ??
                      const ExperimentalAppsState()
                : const ExperimentalAppsState();

            return NovaRefreshIndicator(
              onRefresh: () => _refresh(context),
              child: ResponsiveWrapper(
                maxWidth: ResponsivePadding.rootContentWidth(
                  context.deviceClass,
                ),
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(
                    parent: BouncingScrollPhysics(),
                  ),
                  padding: EdgeInsets.fromLTRB(
                    horizontalPadding,
                    10,
                    horizontalPadding,
                    32 + MediaQuery.paddingOf(context).bottom,
                  ),
                  children: _buildSettingsChildren(
                    context: context,
                    packageInfo: packageInfo,
                    financePreferencesCubit: financePreferencesCubit,
                    experimentalAppsState: experimentalAppsState,
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  List<Widget> _buildSettingsChildren({
    required BuildContext context,
    required PackageInfo? packageInfo,
    required FinancePreferencesCubit? financePreferencesCubit,
    required ExperimentalAppsState experimentalAppsState,
  }) {
    switch (widget.section) {
      case SettingsSectionDestination.overview:
        return [
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
          const shad.Gap(20),
          StaggeredEntry(
            index: 1,
            playOnceKey: 'settings-section-overview',
            child: _SettingsOverviewSection(
              showInfrastructure: _canManageMobileVersions,
            ),
          ),
        ];
      case SettingsSectionDestination.preferences:
        return [
          StaggeredEntry(
            index: 0,
            playOnceKey: 'settings-preferences',
            child: _buildPreferencesSection(context, financePreferencesCubit),
          ),
        ];
      case SettingsSectionDestination.experiments:
        return [
          StaggeredEntry(
            index: 0,
            playOnceKey: 'settings-experimental-apps',
            child: _ExperimentalAppsSection(
              enabledModuleIds: experimentalAppsState.enabledModuleIds,
              onToggleModule: _toggleExperimentalApp,
            ),
          ),
        ];
      case SettingsSectionDestination.infrastructure:
        return [
          const StaggeredEntry(
            index: 0,
            playOnceKey: 'settings-infrastructure',
            child: _InfrastructureSection(),
          ),
        ];
      case SettingsSectionDestination.about:
        return [
          StaggeredEntry(
            index: 0,
            playOnceKey: 'settings-about',
            child: _AboutSection(packageInfo: packageInfo),
          ),
        ];
      case SettingsSectionDestination.session:
        return [
          StaggeredEntry(
            index: 0,
            playOnceKey: 'settings-session',
            child: SessionSettingsSection(
              onSignOut: () => unawaited(_showSignOutDialog()),
            ),
          ),
        ];
    }
  }

  Widget _buildPreferencesSection(
    BuildContext context,
    FinancePreferencesCubit? financePreferencesCubit,
  ) {
    return _PreferencesSection(
      themeLabel: _themeDisplayName(
        context.watch<ThemeCubit>().state.themeMode,
        context.l10n,
      ),
      showFinanceAmounts: financePreferencesCubit?.state.showAmounts ?? false,
      languageLabel: _localeDisplayName(
        Localizations.localeOf(context),
        context.read<LocaleCubit>().state.locale,
        context.l10n,
      ),
      calendarLabel: _calendarDisplayName(
        context.watch<CalendarSettingsCubit>().state,
        context.l10n,
      ),
      onChangeLanguage: () => unawaited(_showLanguageDialog()),
      onToggleFinanceAmounts: () {
        if (financePreferencesCubit == null) {
          return;
        }
        unawaited(financePreferencesCubit.toggleShowAmounts());
      },
      disableDefaultTaskBoardNavigation: _disableDefaultTaskBoardNavigation,
      onToggleDefaultTaskBoardNavigation: _toggleDefaultTaskBoardNavigation,
      onChangeTheme: () => unawaited(_showThemeDialog()),
      onChangeFirstDayOfWeek: () => unawaited(_showCalendarDialog()),
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

  Future<void> _loadDefaultTaskBoardNavigationPreference() async {
    final value = await _settingsRepository
        .getDisableDefaultTaskBoardNavigation();
    if (!mounted) return;
    setState(() => _disableDefaultTaskBoardNavigation = value);
  }

  Future<void> _toggleDefaultTaskBoardNavigation() async {
    final nextValue = !_disableDefaultTaskBoardNavigation;
    setState(() => _disableDefaultTaskBoardNavigation = nextValue);
    await _settingsRepository.setDisableDefaultTaskBoardNavigation(
      value: nextValue,
    );
  }

  void _toggleExperimentalApp(String moduleId) {
    final cubit = context.read<ExperimentalAppsCubit?>();
    if (cubit == null) {
      return;
    }
    unawaited(cubit.toggleModule(moduleId));
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
      if (widget.section == SettingsSectionDestination.overview)
        context.read<ProfileCubit>().loadProfile(forceRefresh: true),
      workspaceCubit.loadWorkspaces(forceRefresh: true),
      workspaceCubit.refreshLimits(),
      if (widget.section == SettingsSectionDestination.preferences)
        calendarCubit.loadUserPreference(),
      if (widget.section == SettingsSectionDestination.overview)
        _loadMobileVersionsAccess(currentWorkspaceId, forceReload: true),
      if (widget.section == SettingsSectionDestination.preferences &&
          currentWorkspaceId != null)
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

import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/onboarding/view/onboarding_page.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/view/product_preference_editors.dart';
import 'package:mobile/features/settings/view/product_settings_registry.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/features/settings/view/settings_session_section.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/features/settings/view/timezone_settings_tile.dart';
import 'package:mobile/features/settings/view/workspace_timezone_settings_tile.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/hidden_workspaces_settings_row.dart';
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
    this.permissionsRepository,
  });

  final SettingsSectionDestination section;
  final WorkspacePermissionsRepository? permissionsRepository;

  @override
  Widget build(BuildContext context) {
    return _SettingsView(
      section: section,
      permissionsRepository: permissionsRepository,
    );
  }
}

class _SettingsView extends StatefulWidget {
  const _SettingsView({required this.section, this.permissionsRepository});

  final SettingsSectionDestination section;
  final WorkspacePermissionsRepository? permissionsRepository;

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
  int _timezonePermissionsRevision = 0;

  @override
  void initState() {
    super.initState();
    _settingsRepository = SettingsRepository();
    _workspacePermissionsRepository =
        widget.permissionsRepository ?? WorkspacePermissionsRepository();
    if (widget.section == SettingsSectionDestination.about) {
      _packageInfoFuture = PackageInfo.fromPlatform();
    }
    final workspaceId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    if ((widget.section == SettingsSectionDestination.preferences ||
            widget.section == SettingsSectionDestination.overview) &&
        workspaceId != null) {
      unawaited(_loadWorkspaceCalendarPreference(workspaceId));
    }
    if (widget.section == SettingsSectionDestination.preferences ||
        widget.section == SettingsSectionDestination.overview) {
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
        if (widget.section == SettingsSectionDestination.overview)
          BlocListener<AuthCubit, AuthState>(
            listenWhen: (previous, current) =>
                previous.user?.id != current.user?.id ||
                previous.status != current.status,
            listener: (context, state) {
              _loadedWorkspaceId = null;
              _mobileVersionsAccessWorkspaceId = null;
              setState(() => _timezonePermissionsRevision++);
              unawaited(
                _loadMobileVersionsAccess(
                  context.read<WorkspaceCubit>().state.currentWorkspace?.id,
                  forceReload: true,
                ),
              );
            },
          ),
        BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.currentWorkspace?.id != current.currentWorkspace?.id,
          listener: (context, state) {
            final workspaceId = state.currentWorkspace?.id;
            if ((widget.section == SettingsSectionDestination.preferences ||
                    widget.section == SettingsSectionDestination.overview) &&
                workspaceId != null) {
              unawaited(_loadWorkspaceCalendarPreference(workspaceId));
            }
            if (widget.section == SettingsSectionDestination.overview) {
              unawaited(_loadMobileVersionsAccess(workspaceId));
            }
          },
        ),
      ],
      child: shad.Scaffold(
        child: FutureBuilder<PackageInfo>(
          future: _packageInfoFuture,
          builder: (context, snapshot) {
            final packageInfo = snapshot.data;
            final financePreferencesCubit =
                (widget.section == SettingsSectionDestination.preferences ||
                    widget.section == SettingsSectionDestination.overview)
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
            playOnceKey: 'settings-root-preferences',
            child: _buildPreferencesSection(context, financePreferencesCubit),
          ),
          const SizedBox(height: 20),
          StaggeredEntry(
            index: 1,
            playOnceKey: 'settings-section-overview',
            child: _SettingsOverviewSection(
              showInfrastructure: _canManageMobileVersions,
            ),
          ),
          const SizedBox(height: 20),
          const ProductSettingsSection(),
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
      permissionsRepository: _workspacePermissionsRepository,
      permissionsRevision: _timezonePermissionsRevision,
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
        unawaited(_showFinanceAmountsDialog(financePreferencesCubit));
      },
      disableDefaultTaskBoardNavigation: _disableDefaultTaskBoardNavigation,
      onToggleDefaultTaskBoardNavigation: () =>
          unawaited(_showDefaultTaskBoardDialog()),
      onChangeTheme: () => unawaited(_showThemeDialog()),
      onChangeFirstDayOfWeek: () => unawaited(_showCalendarDialog()),
      hapticsEnabled: AppHaptics.enabled,
      onToggleHaptics: () => unawaited(_showHapticsDialog()),
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

  Future<void> _showDefaultTaskBoardDialog() async {
    final l10n = context.l10n;
    final selected = await showSettingsChoiceDialog<bool>(
      context: context,
      title: l10n.settingsDefaultTaskBoardNavigation,
      description: l10n.settingsDefaultTaskBoardNavigationDescription,
      currentValue: _disableDefaultTaskBoardNavigation,
      options: [
        SettingsChoiceOption(
          value: false,
          label: l10n.settingsDefaultTaskBoardNavigationDefaultBoard,
          icon: Icons.view_kanban_outlined,
        ),
        SettingsChoiceOption(
          value: true,
          label: l10n.settingsDefaultTaskBoardNavigationBoardPicker,
          icon: Icons.dashboard_outlined,
        ),
      ],
    );
    if (selected == null ||
        !mounted ||
        selected == _disableDefaultTaskBoardNavigation) {
      return;
    }
    await _settingsRepository.setDisableDefaultTaskBoardNavigation(
      value: selected,
    );
    if (mounted) setState(() => _disableDefaultTaskBoardNavigation = selected);
  }

  Future<void> _showFinanceAmountsDialog(FinancePreferencesCubit cubit) =>
      openFinanceProductSettings(context, cubit);

  Future<void> _showHapticsDialog() async {
    final l10n = context.l10n;
    final selected = await showSettingsChoiceDialog<bool>(
      context: context,
      title: l10n.settingsHaptics,
      currentValue: AppHaptics.enabled,
      options: [
        SettingsChoiceOption(
          value: true,
          label: l10n.commonOn,
          icon: Icons.vibration_rounded,
        ),
        SettingsChoiceOption(
          value: false,
          label: l10n.commonOff,
          icon: Icons.notifications_off_outlined,
        ),
      ],
    );
    if (selected != null && mounted && selected != AppHaptics.enabled) {
      await AppHaptics.setEnabled(value: selected);
      if (mounted) setState(() {});
    }
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

    final auth = context.read<AuthCubit?>()?.state;
    final userId = auth?.user?.id;
    setState(() => _canManageMobileVersions = false);
    if (userId == null ||
        auth?.status != AuthStatus.authenticated ||
        workspaceId == null ||
        !isSystemWorkspaceId(workspaceId)) {
      if (!mounted || requestToken != _mobileVersionsAccessLoadToken) {
        return;
      }
      setState(() => _canManageMobileVersions = false);
      return;
    }

    var allowed = false;
    try {
      final permissions = await _workspacePermissionsRepository.getPermissions(
        wsId: rootWorkspaceId,
        userId: userId,
      );
      allowed = permissions.containsPermission(manageWorkspaceRolesPermission);
    } on Exception {
      // Loading or failed access never exposes an administrative destination.
    }
    if (!mounted || requestToken != _mobileVersionsAccessLoadToken) return;
    setState(() => _canManageMobileVersions = allowed);
  }

  Future<void> _refresh(BuildContext context) async {
    setState(() => _timezonePermissionsRevision++);
    final workspaceCubit = context.read<WorkspaceCubit>();
    final calendarCubit = context.read<CalendarSettingsCubit>();
    final currentWorkspaceId = workspaceCubit.state.currentWorkspace?.id;

    await Future.wait([
      workspaceCubit.loadWorkspaces(forceRefresh: true),
      workspaceCubit.refreshLimits(),
      if (widget.section == SettingsSectionDestination.preferences ||
          widget.section == SettingsSectionDestination.overview)
        calendarCubit.loadUserPreference(),
      if (widget.section == SettingsSectionDestination.overview)
        _loadMobileVersionsAccess(currentWorkspaceId, forceReload: true),
      if ((widget.section == SettingsSectionDestination.preferences ||
              widget.section == SettingsSectionDestination.overview) &&
          currentWorkspaceId != null)
        calendarCubit.loadWorkspacePreference(currentWorkspaceId),
    ]);
  }

  Future<void> _showCalendarDialog() => openCalendarProductSettings(context);

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

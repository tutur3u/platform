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
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/onboarding/view/onboarding_page.dart';
import 'package:mobile/features/settings/cubit/calendar_settings_cubit.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/settings/cubit/locale_cubit.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/view/appearance/appearance_labels.dart';
import 'package:mobile/features/settings/view/link_browser_settings_tile.dart';
import 'package:mobile/features/settings/view/product_settings_registry.dart';
import 'package:mobile/features/settings/view/settings_dialogs.dart';
import 'package:mobile/features/settings/view/settings_profile_header.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_search.dart';
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

part 'settings_page_actions.dart';
part 'settings_page_search.dart';
part 'settings_page_widgets.dart';
part 'settings_preferences_section.dart';

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

class _SettingsViewState extends State<_SettingsView>
    with _SettingsPageActions, _SettingsPageSearch {
  Future<PackageInfo>? _packageInfoFuture;
  late final WorkspacePermissionsRepository _workspacePermissionsRepository;
  String? _loadedWorkspaceId;
  bool _canManageMobileVersions = false;
  String? _mobileVersionsAccessWorkspaceId;
  int _mobileVersionsAccessLoadToken = 0;
  int _timezonePermissionsRevision = 0;

  @override
  void initState() {
    super.initState();
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
      unawaited(_loadAppearanceIntro());
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
                  padding: SettingsRowLayout.scrollPadding(
                    context,
                    horizontalPadding,
                  ),
                  children: _buildSettingsChildren(
                    context: context,
                    packageInfo: packageInfo,
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
    required ExperimentalAppsState experimentalAppsState,
  }) {
    switch (widget.section) {
      case SettingsSectionDestination.overview:
        final searching = _searchQuery.trim().isNotEmpty;
        return [
          const SettingsProfileHeader(),
          const SizedBox(height: SettingsRowLayout.groupGap),
          SettingsSearchField(
            controller: _searchController,
            onChanged: _onSearchChanged,
          ),
          const SizedBox(height: SettingsRowLayout.groupGap),
          if (searching)
            SettingsSearchResults(
              query: _searchQuery,
              results: filterSettingsSearch(
                _searchEntries(
                  context,
                  showInfrastructure: _canManageMobileVersions,
                ),
                _searchQuery,
              ),
            )
          else ...[
            StaggeredEntry(
              index: 0,
              playOnceKey: 'settings-root-preferences',
              child: _buildPreferencesSection(context),
            ),
            const SizedBox(height: SettingsRowLayout.groupGap),
            StaggeredEntry(
              index: 1,
              playOnceKey: 'settings-root-apps',
              child: ProductSettingsSection(key: _anchor('apps')),
            ),
            const SizedBox(height: SettingsRowLayout.groupGap),
            StaggeredEntry(
              index: 2,
              playOnceKey: 'settings-section-overview',
              child: _SettingsOverviewSection(
                showInfrastructure: _canManageMobileVersions,
                anchors: _anchor,
              ),
            ),
          ],
        ];
      case SettingsSectionDestination.preferences:
        return [
          StaggeredEntry(
            index: 0,
            playOnceKey: 'settings-preferences',
            child: _buildPreferencesSection(context),
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

  Widget _buildPreferencesSection(BuildContext context) {
    final themeState = context.watch<ThemeCubit>().state;
    return _PreferencesSection(
      permissionsRepository: _workspacePermissionsRepository,
      permissionsRevision: _timezonePermissionsRevision,
      appearanceTheme: context.l10n.appearanceTheme(
        themeState.appearance.theme,
      ),
      appearanceIsNew: !_appearanceIntroSeen,
      languageLabel: _localeDisplayName(
        Localizations.localeOf(context),
        context.read<LocaleCubit>().state.locale,
        context.l10n,
      ),
      onChangeLanguage: () => unawaited(_showLanguageDialog()),
      onOpenAppearance: _openAppearance,
      hapticsEnabled: AppHaptics.enabled,
      onToggleHaptics: () => unawaited(_showHapticsDialog()),
      anchors: _anchor,
    );
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
}

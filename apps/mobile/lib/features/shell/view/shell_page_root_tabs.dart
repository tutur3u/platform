part of 'shell_page.dart';

/// Key of the phone dock's More destination.
const shellRootMoreKey = ValueKey<String>('shell-root-more');

/// Modules the phone More sheet lists after the unpinned root tabs, when
/// visible.
const List<String> _moreModuleIds = ['finance', 'drive', 'timer'];

/// Key of a module row in the phone More sheet.
ValueKey<String> shellRootModuleKey(String moduleId) =>
    ValueKey<String>('shell-root-module-$moduleId');

/// Key of the Settings row in the phone More sheet.
const shellRootSettingsKey = ValueKey<String>('shell-root-settings');

/// Root destinations of the tablet rail, in order.
const List<ShellRootTab> _railRootTabs = [
  ShellRootTab.home,
  ShellRootTab.apps,
  ShellRootTab.assistant,
  ShellRootTab.notifications,
  ShellRootTab.profile,
];

/// Route of a root destination key; the layered layout's Apps layer uses a
/// [GlobalKey].
String _routeForRootKey(Key? key) =>
    ShellRootTab.fromKey(key)?.route ??
    (key is GlobalKey ? Routes.apps : Routes.home);

/// Phone dock root destinations: up to four chosen tabs plus More, which
/// lists the remaining destinations and the tab editor. The tablet rail keeps
/// its fixed destinations.
extension _ShellPageRootTabs on _ShellPageState {
  bool get _usesRail =>
      shellNavigationModeFor(MediaQuery.sizeOf(context)) ==
      ShellNavigationMode.rail;

  /// Resolves the phone tabs against what [context] can open. Runs during
  /// build so module visibility stays subscribed.
  void _syncRootTabs(BuildContext context) {
    _availableRootTabs = {
      for (final tab in ShellRootTab.values)
        if (tab.moduleId == null ||
            (AppRegistry.moduleById(tab.moduleId)?.visibleIn(context) ?? false))
          tab,
    };
    _phoneRootTabs = _resolveRootTabs(_rootTabs.state);
    _visibleMoreModules = {
      for (final id in _moreModuleIds)
        if (AppRegistry.moduleById(id)?.visibleIn(context) ?? false) id,
    };
  }

  List<ShellRootTab> _resolveRootTabs(List<ShellRootTab>? chosen) =>
      resolveShellRootTabs(chosen, isAvailable: _availableRootTabs.contains);

  List<shad.NavigationItem> _rootNavItems(AppLocalizations l10n) {
    if (_usesRail) {
      return [
        for (final (index, tab) in _railRootTabs.indexed)
          _rootTabNavItem(tab, l10n, index),
      ];
    }
    return [
      for (final (index, tab) in _phoneRootTabs.indexed)
        _rootTabNavItem(tab, l10n, index),
      shad.NavigationItem(
        key: shellRootMoreKey,
        child: _buildCompactNavIcon(
          icon: Icons.more_horiz,
          semanticLabel: l10n.navMore,
          itemIndex: _phoneRootTabs.length,
        ),
      ),
    ];
  }

  shad.NavigationItem _rootTabNavItem(
    ShellRootTab tab,
    AppLocalizations l10n,
    int index,
  ) => shad.NavigationItem(
    key: tab.key,
    child: _buildCompactNavIcon(
      icon: switch (tab) {
        ShellRootTab.home => LucideIcons.house,
        ShellRootTab.apps => LucideIcons.layoutGrid,
        ShellRootTab.assistant => LucideIcons.sparkles,
        ShellRootTab.notifications => LucideIcons.bell,
        ShellRootTab.profile => LucideIcons.circleUserRound,
        _ => AppRegistry.moduleById(tab.moduleId)?.icon ?? LucideIcons.house,
      },
      image: switch (tab) {
        ShellRootTab.assistant => NovaLoadingIndicator(
          key: ValueKey(_rootTabReplayTokens[Routes.assistant] ?? 0),
          size: 22,
          repeat: false,
          play: widget.matchedLocation == Routes.assistant,
        ),
        ShellRootTab.profile => const ProfileNavigationAvatar(),
        _ => null,
      },
      semanticLabel: switch (tab) {
        ShellRootTab.home => l10n.navHome,
        ShellRootTab.tasks => l10n.navTasks,
        ShellRootTab.calendar => l10n.navCalendar,
        ShellRootTab.mail => l10n.mailTitle,
        ShellRootTab.assistant => l10n.navMira,
        ShellRootTab.apps => l10n.navApps,
        ShellRootTab.notifications => l10n.navAlerts,
        ShellRootTab.profile => l10n.profileTitle,
      },
      itemIndex: index,
    ),
  );

  /// The root destination [location] shows, if it is one.
  ShellRootTab? _rootTabForLocation(String location) => switch (location) {
    Routes.home => ShellRootTab.home,
    Routes.assistant => ShellRootTab.assistant,
    Routes.apps => ShellRootTab.apps,
    Routes.notifications ||
    Routes.notificationsArchive => ShellRootTab.notifications,
    Routes.profileRoot => ShellRootTab.profile,
    _ => null,
  };

  /// The phone dock slot for [location]: its tab, or More for a root
  /// destination that is not pinned.
  Key? _phoneRootSelectedKey(String location) {
    final tab = _rootTabForLocation(location);
    if (tab == null) return null;
    return _phoneRootTabs.contains(tab) ? tab.key : shellRootMoreKey;
  }

  Future<void> _onRootItemTapped(Key? key, BuildContext context) async {
    if (key == shellRootMoreKey) {
      await _openRootMore(context);
      return;
    }
    await _onItemTapped(_routeForRootKey(key), context);
  }

  /// Unpinned root tabs, then the extra modules visible at the last build,
  /// then Settings.
  List<ShellDockEntry> _rootMoreDestinations(AppLocalizations l10n) {
    ShellDockEntry entry(Key key, IconData icon, String label) =>
        ShellDockEntry(key: key, label: label, glyph: Icon(icon));
    return [
      for (final (index, tab) in ShellRootTab.values.indexed)
        if (_availableRootTabs.contains(tab) && !_phoneRootTabs.contains(tab))
          shellDockEntryFor(_rootTabNavItem(tab, l10n, index)),
      for (final id in _moreModuleIds)
        if (AppRegistry.moduleById(id) case final module?
            when _visibleMoreModules.contains(id))
          entry(shellRootModuleKey(id), module.icon, module.label(l10n)),
      entry(shellRootSettingsKey, LucideIcons.settings, l10n.navSettings),
    ];
  }

  Future<void> _openRootMore(BuildContext context) async {
    final l10n = context.l10n;
    final key = await showShellRootMoreSheet(
      context: context,
      workspace: context.read<WorkspaceCubit?>()?.state.currentWorkspace,
      destinations: _rootMoreDestinations(l10n),
      selectedKey: _rootTabForLocation(
        _normalizeRouteLocation(widget.matchedLocation),
      )?.key,
      canReset: _rootTabs.state != null,
    );
    if (!mounted || !context.mounted || key == null) return;
    if (key == shellRootWorkspaceKey) {
      await showWorkspacePicker(context);
      return;
    }
    if (key == shellRootResetTabsKey) {
      await _rootTabs.reset();
      return;
    }
    if (key == shellRootEditTabsKey) {
      await showShellRootTabsEditor(
        context: context,
        cubit: _rootTabs,
        candidates: [
          for (final (index, tab) in ShellRootTab.values.indexed)
            if (_availableRootTabs.contains(tab))
              shellDockEntryFor(_rootTabNavItem(tab, l10n, index)),
        ],
        resolve: _resolveRootTabs,
      );
      return;
    }
    final route = key == shellRootSettingsKey
        ? Routes.settings
        : ShellRootTab.fromKey(key)?.route ??
              _moreModuleIds
                  .where((id) => key == shellRootModuleKey(id))
                  .map((id) => AppRegistry.moduleById(id)?.route)
                  .firstOrNull;
    if (route != null) await _onItemTapped(route, context);
  }
}

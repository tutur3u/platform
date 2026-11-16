part of 'shell_page.dart';

extension _ShellPageNavigation on _ShellPageState {
  /// The five fixed dock destinations, shown as icons: Home, Apps, Mira,
  /// Notifications and You. The archive below Notifications leads with Back.
  List<shad.NavigationItem> _buildNavItems(
    BuildContext context,
    AppTabState state,
    AppLocalizations l10n,
  ) => [
    if (_showsGlobalBack(widget.matchedLocation))
      shad.NavigationItem(
        key: _ShellPageState._backToRootKey,
        child: _buildCompactNavIcon(
          icon: AppIcons.back,
          semanticLabel: l10n.navBack,
          itemIndex: 0,
        ),
      ),
    shad.NavigationItem(
      key: _ShellPageState._homeKey,
      child: _buildCompactNavIcon(
        icon: LucideIcons.house,
        semanticLabel: l10n.navHome,
        itemIndex: 0,
      ),
    ),
    shad.NavigationItem(
      key: _ShellPageState._appsKey,
      child: _buildCompactNavIcon(
        icon: LucideIcons.layoutGrid,
        semanticLabel: l10n.navApps,
        itemIndex: 1,
      ),
    ),
    shad.NavigationItem(
      key: _ShellPageState._assistantKey,
      child: _buildCompactNavIcon(
        icon: LucideIcons.sparkles,
        image: NovaLoadingIndicator(
          key: ValueKey(_rootTabReplayTokens[Routes.assistant] ?? 0),
          size: 22,
          repeat: false,
          play: widget.matchedLocation == Routes.assistant,
        ),
        semanticLabel: l10n.navMira,
        itemIndex: 2,
      ),
    ),
    shad.NavigationItem(
      key: _ShellPageState._notificationsKey,
      child: _buildCompactNavIcon(
        icon: LucideIcons.bell,
        semanticLabel: l10n.notificationsTitle,
        itemIndex: 3,
      ),
    ),
    shad.NavigationItem(
      key: _ShellPageState._profileKey,
      child: _buildCompactNavIcon(
        icon: LucideIcons.circleUserRound,
        image: const ProfileNavigationAvatar(),
        semanticLabel: l10n.profileTitle,
        itemIndex: 4,
      ),
    ),
  ];

  bool _showsGlobalBack(String location) =>
      location == Routes.notificationsArchive;

  Widget _buildCompactNavIcon({
    required IconData icon,
    required String semanticLabel,
    required int itemIndex,
    Widget? image,
    bool dropdown = false,
  }) => Semantics(
    label: semanticLabel,
    button: true,
    child: ExcludeSemantics(
      child: SizedBox(
        width: dropdown ? 36 : 22,
        height: 22,
        child: dropdown
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 20),
                  const Icon(Icons.expand_more, size: 14),
                ],
              )
            : image ?? Icon(icon, size: 22),
      ),
    ),
  );

  List<shad.NavigationItem> _buildMiniAppNavItems(
    BuildContext context,
    AppModule module,
    List<MiniAppNavItem> miniNavItems,
  ) => [
    shad.NavigationItem(
      key: _ShellPageState._backToRootKey,
      child: _buildCompactNavIcon(
        icon: Icons.chevron_left,
        semanticLabel: context.l10n.navBack,
        itemIndex: 0,
      ),
    ),
    ...miniNavItems.indexed.map(
      (entry) => shad.NavigationItem(
        key: _miniNavKey(module.id, entry.$2.id),
        child: _buildCompactNavIcon(
          icon: entry.$2.icon,
          semanticLabel: entry.$2.label(context.l10n),
          itemIndex: entry.$1 + 1,
        ),
      ),
    ),
  ];

  ValueKey<String> _miniNavKey(String moduleId, String itemId) =>
      ValueKey<String>('mini-nav-$moduleId-$itemId');

  ValueKey<String> _injectedMiniNavKey(String ownerId, String itemId) =>
      ValueKey<String>('injected-mini-nav-$ownerId-$itemId');

  Key _miniSelectedKey(BuildContext context, List<MiniAppNavItem> items) {
    if (items.isEmpty) {
      return _ShellPageState._backToRootKey;
    }

    final location = widget.matchedLocation;
    final selected = _miniSelectedIndex(location, items);
    final item = items[selected];
    final activeModule = AppRegistry.moduleFromLocation(location);
    if (activeModule == null) {
      return _miniNavKey('unknown', item.id);
    }

    return _miniNavKey(activeModule.id, item.id);
  }

  Key? _injectedMiniSelectedKey(ShellMiniNavRegistration? registration) {
    if (registration == null || registration.items.isEmpty) {
      return null;
    }

    final selectedItem = registration.items.firstWhere(
      (item) => item.selected,
      orElse: () => registration.items.first,
    );
    return _injectedMiniNavKey(registration.ownerId, selectedItem.id);
  }

  List<shad.NavigationItem> _buildInjectedMiniNavItems(
    BuildContext context,
    ShellMiniNavRegistration registration,
    bool useDirectCallbacks,
  ) {
    const miniItemSpacing = _ShellPageState._miniNavItemSpacing;

    return registration.items.indexed
        .map((entry) {
          final item = entry.$2;
          return shad.NavigationItem(
            key: _injectedMiniNavKey(registration.ownerId, item.id),
            spacing: miniItemSpacing,
            enabled: item.enabled,
            onChanged: useDirectCallbacks
                ? (selected) {
                    if (selected && item.enabled) {
                      _onInjectedMiniNavItemTapped(
                        _injectedMiniNavKey(registration.ownerId, item.id),
                        registration,
                      );
                    }
                  }
                : null,
            child: _buildCompactNavIcon(
              icon: item.icon,
              dropdown: item.dropdown,
              semanticLabel: item.label,
              itemIndex: entry.$1,
            ),
          );
        })
        .toList(growable: false);
  }

  int _miniSelectedIndex(String location, List<MiniAppNavItem> items) =>
      miniNavSelectedIndex(location, items);

  Key? _selectedKeyForLocation(String location) {
    if (location == Routes.home) {
      return _ShellPageState._homeKey;
    }
    if (location == Routes.notifications ||
        location == Routes.notificationsArchive) {
      return _ShellPageState._notificationsKey;
    }
    if (location == Routes.profileRoot) {
      return _ShellPageState._profileKey;
    }
    if (location == Routes.assistant) {
      return _ShellPageState._assistantKey;
    }
    if (location == Routes.apps ||
        AppRegistry.moduleFromLocation(location) != null) {
      return _ShellPageState._appsKey;
    }

    return null;
  }

  bool _isRootTabLocation(String location) {
    return location == Routes.home ||
        location == Routes.assistant ||
        location == Routes.apps ||
        location == Routes.notifications ||
        location == Routes.profileRoot;
  }
}

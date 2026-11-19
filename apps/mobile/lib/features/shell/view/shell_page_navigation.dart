part of 'shell_page.dart';

extension _ShellPageNavigation on _ShellPageState {
  /// Root destinations and the Back control for detail routes.
  List<shad.NavigationItem> _buildNavItems(
    BuildContext context,
    AppLocalizations l10n,
  ) => [
    if (_showsGlobalBack(context, widget.matchedLocation))
      _defaultBackItem(l10n),
    ..._rootNavItems(l10n),
  ];

  shad.NavigationItem _defaultBackItem(AppLocalizations l10n) =>
      shad.NavigationItem(
        key: _ShellPageState._backToRootKey,
        child: _buildCompactNavIcon(
          icon: AppIcons.back,
          semanticLabel: l10n.navBack,
        ),
      );

  bool _showsGlobalBack(BuildContext context, String location) =>
      !_isRootTabLocation(location) ||
      context.select<ShellChromeActionsCubit?, bool>(
        (cubit) =>
            cubit?.state.registrations.values.any(
              (registration) =>
                  registration.locations.contains(location) &&
                  registration.onBack != null,
            ) ??
            false,
      );

  Widget _buildCompactNavIcon({
    required IconData icon,
    required String semanticLabel,
    Widget? image,
    bool dropdown = false,
  }) => ShellDockNavIcon(
    icon: icon,
    label: semanticLabel,
    image: image,
    dropdown: dropdown,
  );

  List<shad.NavigationItem> _buildMiniAppNavItems(
    BuildContext context,
    AppModule module,
    List<MiniAppNavItem> miniNavItems,
  ) => [
    _defaultBackItem(context.l10n),
    ...miniNavItems.map(
      (entry) => shad.NavigationItem(
        key: _miniNavKey(module.id, entry.id),
        child: _buildCompactNavIcon(
          icon: entry.icon,
          semanticLabel: entry.label(context.l10n),
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
            ),
          );
        })
        .toList(growable: false);
  }

  int _miniSelectedIndex(String location, List<MiniAppNavItem> items) =>
      miniNavSelectedIndex(location, items);

  Key? _selectedKeyForLocation(String location) =>
      _rootTabForLocation(location)?.key;

  bool _isRootTabLocation(String location) {
    return location == Routes.home ||
        location == Routes.assistant ||
        location == Routes.apps ||
        location == Routes.notifications ||
        location == Routes.profileRoot;
  }
}

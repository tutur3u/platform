part of 'shell_page.dart';

extension _ShellPageNavigation on _ShellPageState {
  List<shad.NavigationItem> _buildNavItems(
    BuildContext context,
    AppTabState state,
    AppLocalizations l10n, {
    bool useGlobalKey = true,
  }) {
    final theme = shad.Theme.of(context);
    final labelStyle = theme.typography.p.copyWith(
      fontSize: 12,
      fontWeight: FontWeight.w600,
    );
    final isCompact = context.isCompact;

    return [
      shad.NavigationItem(
        key: _ShellPageState._homeKey,
        spacing: _ShellPageState._navItemSpacing,
        label: isCompact ? _buildNavLabel(l10n.navHome, labelStyle) : null,
        child: isCompact
            ? const Icon(
                Icons.home_outlined,
                size: _ShellPageState._navIconSize,
              )
            : _buildHorizontalNavItem(
                icon: Icons.home_outlined,
                label: l10n.navHome,
                style: labelStyle,
              ),
      ),
      shad.NavigationItem(
        key: _ShellPageState._assistantKey,
        spacing: _ShellPageState._navItemSpacing,
        label: isCompact ? _buildNavLabel(l10n.navAssistant, labelStyle) : null,
        child: isCompact
            ? const Icon(
                Icons.auto_awesome_outlined,
                size: _ShellPageState._navIconSize,
              )
            : _buildHorizontalNavItem(
                icon: Icons.auto_awesome_outlined,
                label: l10n.navAssistant,
                style: labelStyle,
              ),
      ),
      shad.NavigationItem(
        key: useGlobalKey ? _appsTabKey : _ShellPageState._appsKey,
        spacing: _ShellPageState._navItemSpacing,
        label: isCompact ? _buildNavLabel(l10n.navApps, labelStyle) : null,
        child: isCompact
            ? const Icon(
                Icons.apps_outlined,
                size: _ShellPageState._navIconSize,
              )
            : _buildHorizontalNavItem(
                icon: Icons.apps_outlined,
                label: l10n.navApps,
                style: labelStyle,
              ),
      ),
    ];
  }

  Widget _buildHorizontalNavItem({
    required IconData icon,
    required String label,
    required TextStyle style,
  }) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: _ShellPageState._navIconSize),
        const SizedBox(width: 6),
        Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: style,
        ),
      ],
    );
  }

  Widget _buildNavLabel(String text, TextStyle style) {
    return Text(
      text,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      textAlign: TextAlign.center,
      style: style,
    );
  }

  List<shad.NavigationItem> _buildMiniAppNavItems(
    BuildContext context,
    AppModule module,
    List<MiniAppNavItem> miniNavItems,
  ) {
    final theme = shad.Theme.of(context);
    final labelStyle = theme.typography.p.copyWith(
      fontSize: 12,
      fontWeight: FontWeight.w600,
    );
    final l10n = context.l10n;
    final isCompact = context.isCompact;
    final useDenseCompactLabels = isCompact && miniNavItems.length >= 4;
    final miniLabelStyle = useDenseCompactLabels
        ? labelStyle.copyWith(fontSize: 10)
        : labelStyle;
    final miniItemSpacing = useDenseCompactLabels
        ? 1.0
        : _ShellPageState._navItemSpacing;
    final miniIconSize = useDenseCompactLabels
        ? 20.0
        : _ShellPageState._navIconSize;

    return [
      shad.NavigationItem(
        key: _ShellPageState._backToRootKey,
        spacing: miniItemSpacing,
        alignment: Alignment.center,
        marginAlignment: Alignment.center,
        label: isCompact ? _buildNavLabel(l10n.navBack, miniLabelStyle) : null,
        child: isCompact
            ? Icon(Icons.chevron_left, size: miniIconSize)
            : _buildHorizontalNavItem(
                icon: Icons.chevron_left,
                label: l10n.navBack,
                style: labelStyle,
              ),
      ),
      ...miniNavItems.map(
        (item) => shad.NavigationItem(
          key: _miniNavKey(module.id, item.id),
          spacing: miniItemSpacing,
          label: isCompact
              ? _buildNavLabel(item.label(l10n), miniLabelStyle)
              : null,
          child: isCompact
              ? Icon(item.icon, size: miniIconSize)
              : _buildHorizontalNavItem(
                  icon: item.icon,
                  label: item.label(l10n),
                  style: labelStyle,
                ),
        ),
      ),
    ];
  }

  ValueKey<String> _miniNavKey(String moduleId, String itemId) =>
      ValueKey<String>('mini-nav-$moduleId-$itemId');

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

  int _miniSelectedIndex(String location, List<MiniAppNavItem> items) {
    if (items.isEmpty) {
      return 0;
    }

    String normalize(String value) {
      var normalized = value;
      while (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.substring(0, normalized.length - 1);
      }
      return normalized;
    }

    final normalizedLocation = normalize(location);
    var bestIndex = 0;
    var bestMatchLength = -1;

    for (var index = 0; index < items.length; index++) {
      final route = normalize(items[index].route);
      final isMatch =
          normalizedLocation == route ||
          normalizedLocation.startsWith('$route/');
      if (!isMatch) {
        continue;
      }

      if (route.length > bestMatchLength) {
        bestMatchLength = route.length;
        bestIndex = index;
      }
    }

    return bestMatchLength >= 0 ? bestIndex : 0;
  }

  Key? _selectedKeyForLocation(String location, {bool useGlobalKey = true}) {
    if (location == Routes.home) {
      return _ShellPageState._homeKey;
    }
    if (location == Routes.assistant) {
      return _ShellPageState._assistantKey;
    }
    if (location == Routes.apps ||
        AppRegistry.moduleFromLocation(location) != null) {
      return useGlobalKey ? _appsTabKey : _ShellPageState._appsKey;
    }

    return null;
  }

  bool _isRootTabLocation(String location) {
    return location == Routes.home ||
        location == Routes.assistant ||
        location == Routes.apps;
  }

  int _rootTabIndex(String location) {
    if (location == Routes.assistant) return 1;
    if (location == Routes.apps) return 2;
    return 0;
  }
}

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
        label: isCompact
            ? _buildNavLabel(
                l10n.navHome,
                labelStyle,
                itemIndex: 0,
              )
            : null,
        child: isCompact
            ? _buildAnimatedNavElement(
                itemIndex: 0,
                slotDelay: 0,
                child: const Icon(
                  Icons.home_outlined,
                  size: _ShellPageState._navIconSize,
                ),
              )
            : _buildHorizontalNavItem(
                icon: Icons.home_outlined,
                label: l10n.navHome,
                style: labelStyle,
                itemIndex: 0,
              ),
      ),
      shad.NavigationItem(
        key: _ShellPageState._assistantKey,
        spacing: _ShellPageState._navItemSpacing,
        child: _buildAssistantNavIcon(
          semanticLabel: l10n.navAssistant,
          itemIndex: 1,
        ),
      ),
      shad.NavigationItem(
        key: useGlobalKey ? _appsTabKey : _ShellPageState._appsKey,
        spacing: _ShellPageState._navItemSpacing,
        label: isCompact
            ? _buildNavLabel(
                l10n.navApps,
                labelStyle,
                itemIndex: 2,
              )
            : null,
        child: isCompact
            ? _buildAnimatedNavElement(
                itemIndex: 2,
                slotDelay: 0,
                child: const Icon(
                  Icons.apps_outlined,
                  size: _ShellPageState._navIconSize,
                ),
              )
            : _buildHorizontalNavItem(
                icon: Icons.apps_outlined,
                label: l10n.navApps,
                style: labelStyle,
                itemIndex: 2,
              ),
      ),
    ];
  }

  Widget _buildHorizontalNavItem({
    required IconData icon,
    required String label,
    required TextStyle style,
    required int itemIndex,
  }) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _buildAnimatedNavElement(
          itemIndex: itemIndex,
          slotDelay: 0,
          child: Icon(icon, size: _ShellPageState._navIconSize),
        ),
        const SizedBox(width: 6),
        _buildAnimatedNavElement(
          itemIndex: itemIndex,
          slotDelay: 0.08,
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: style,
          ),
        ),
      ],
    );
  }

  Widget _buildNavLabel(
    String text,
    TextStyle style, {
    required int itemIndex,
  }) {
    return _buildAnimatedNavElement(
      itemIndex: itemIndex,
      slotDelay: 0.08,
      child: Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
        style: style,
      ),
    );
  }

  Widget _buildAssistantNavIcon({
    required String semanticLabel,
    required int itemIndex,
  }) {
    return _buildAnimatedNavElement(
      itemIndex: itemIndex,
      slotDelay: 0,
      child: Semantics(
        label: semanticLabel,
        button: true,
        child: ExcludeSemantics(
          child: RotationTransition(
            turns: _assistantSpinTurns,
            child: Image.asset(
              'assets/logos/nova-transparent.png',
              width: _ShellPageState._assistantNavIconSize,
              height: _ShellPageState._assistantNavIconSize,
              fit: BoxFit.contain,
              filterQuality: FilterQuality.high,
            ),
          ),
        ),
      ),
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
        label: isCompact
            ? _buildNavLabel(
                l10n.navBack,
                miniLabelStyle,
                itemIndex: 0,
              )
            : null,
        child: isCompact
            ? _buildAnimatedNavElement(
                itemIndex: 0,
                slotDelay: 0,
                child: Icon(Icons.chevron_left, size: miniIconSize),
              )
            : _buildHorizontalNavItem(
                icon: Icons.chevron_left,
                label: l10n.navBack,
                style: labelStyle,
                itemIndex: 0,
              ),
      ),
      ...miniNavItems.indexed.map(
        (entry) => shad.NavigationItem(
          key: _miniNavKey(module.id, entry.$2.id),
          spacing: miniItemSpacing,
          label: isCompact
              ? _buildAnimatedNavElement(
                  itemIndex: entry.$1 + 1,
                  slotDelay: 0.08,
                  child: Text(
                    entry.$2.label(l10n),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: miniLabelStyle,
                  ),
                )
              : null,
          child: isCompact
              ? _buildAnimatedNavElement(
                  itemIndex: entry.$1 + 1,
                  slotDelay: 0,
                  child: Icon(entry.$2.icon, size: miniIconSize),
                )
              : _buildHorizontalNavItem(
                  icon: entry.$2.icon,
                  label: entry.$2.label(l10n),
                  style: labelStyle,
                  itemIndex: entry.$1 + 1,
                ),
        ),
      ),
    ];
  }

  Widget _buildAnimatedNavElement({
    required int itemIndex,
    required double slotDelay,
    required Widget child,
  }) {
    return child;
  }

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
  ) {
    final theme = shad.Theme.of(context);
    final labelStyle = theme.typography.p.copyWith(
      fontSize: 12,
      fontWeight: FontWeight.w600,
    );
    final isCompact = context.isCompact;
    final useDenseCompactLabels = isCompact && registration.items.length >= 4;
    final miniLabelStyle = useDenseCompactLabels
        ? labelStyle.copyWith(fontSize: 10)
        : labelStyle;
    final miniItemSpacing = useDenseCompactLabels
        ? 1.0
        : _ShellPageState._navItemSpacing;
    final miniIconSize = useDenseCompactLabels
        ? 20.0
        : _ShellPageState._navIconSize;

    return registration.items.indexed
        .map((entry) {
          final item = entry.$2;
          return shad.NavigationItem(
            key: _injectedMiniNavKey(registration.ownerId, item.id),
            spacing: miniItemSpacing,
            label: isCompact
                ? _buildAnimatedNavElement(
                    itemIndex: entry.$1,
                    slotDelay: 0.08,
                    child: Text(
                      item.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: miniLabelStyle,
                    ),
                  )
                : null,
            child: isCompact
                ? _buildAnimatedNavElement(
                    itemIndex: entry.$1,
                    slotDelay: 0,
                    child: Icon(item.icon, size: miniIconSize),
                  )
                : _buildHorizontalNavItem(
                    icon: item.icon,
                    label: item.label,
                    style: labelStyle,
                    itemIndex: entry.$1,
                  ),
          );
        })
        .toList(growable: false);
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
}

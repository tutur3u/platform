part of 'shell_page.dart';

extension _ShellPageNavigation on _ShellPageState {
  List<shad.NavigationItem> _buildNavItems(
    BuildContext context,
    AppTabState state,
    AppLocalizations l10n,
  ) {
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
            ? _buildNavLabel(l10n.navHome, labelStyle, itemIndex: 0)
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
        key: _ShellPageState._appsKey,
        spacing: _ShellPageState._navItemSpacing,
        label: isCompact
            ? _buildNavLabel(l10n.navApps, labelStyle, itemIndex: 2)
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
    double iconSize = _ShellPageState._navIconSize,
  }) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _buildAnimatedNavElement(
          itemIndex: itemIndex,
          slotDelay: 0,
          child: Icon(icon, size: iconSize),
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

  Widget _buildCompactNavIcon({
    required IconData icon,
    required String semanticLabel,
    required int itemIndex,
    double iconSize = _ShellPageState._navIconSize,
  }) {
    return _buildAnimatedNavElement(
      itemIndex: itemIndex,
      slotDelay: 0,
      child: Semantics(
        label: semanticLabel,
        button: true,
        child: ExcludeSemantics(child: Icon(icon, size: iconSize)),
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
    List<MiniAppNavItem> miniNavItems, {
    required bool showCompactLabels,
  }) {
    final theme = shad.Theme.of(context);
    final labelStyle = theme.typography.p.copyWith(
      fontSize: 12,
      fontWeight: FontWeight.w600,
    );
    final l10n = context.l10n;
    final isCompact = context.isCompact;
    final miniLabelStyle = labelStyle.copyWith(
      fontSize: _ShellPageState._miniNavLabelFontSize,
    );
    const miniItemSpacing = _ShellPageState._miniNavItemSpacing;
    const miniIconSize = _ShellPageState._miniNavIconSize;

    return [
      shad.NavigationItem(
        key: _ShellPageState._backToRootKey,
        spacing: miniItemSpacing,
        alignment: Alignment.center,
        marginAlignment: Alignment.center,
        label: isCompact && showCompactLabels
            ? _buildNavLabel(l10n.navBack, miniLabelStyle, itemIndex: 0)
            : null,
        child: isCompact
            ? _buildCompactNavIcon(
                icon: Icons.chevron_left,
                semanticLabel: l10n.navBack,
                itemIndex: 0,
                iconSize: miniIconSize,
              )
            : _buildHorizontalNavItem(
                icon: Icons.chevron_left,
                label: l10n.navBack,
                style: miniLabelStyle,
                itemIndex: 0,
                iconSize: miniIconSize,
              ),
      ),
      ...miniNavItems.indexed.map(
        (entry) => shad.NavigationItem(
          key: _miniNavKey(module.id, entry.$2.id),
          spacing: miniItemSpacing,
          label: isCompact && showCompactLabels
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
              ? _buildCompactNavIcon(
                  icon: entry.$2.icon,
                  semanticLabel: entry.$2.label(l10n),
                  itemIndex: entry.$1 + 1,
                  iconSize: miniIconSize,
                )
              : _buildHorizontalNavItem(
                  icon: entry.$2.icon,
                  label: entry.$2.label(l10n),
                  style: miniLabelStyle,
                  itemIndex: entry.$1 + 1,
                  iconSize: miniIconSize,
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
    return _StaggeredNavElement(
      itemIndex: itemIndex,
      slotDelay: slotDelay,
      child: child,
    );
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
    bool useDirectCallbacks, {
    required bool showCompactLabels,
  }) {
    final theme = shad.Theme.of(context);
    final labelStyle = theme.typography.p.copyWith(
      fontSize: 12,
      fontWeight: FontWeight.w600,
    );
    final isCompact = context.isCompact;
    final miniLabelStyle = labelStyle.copyWith(
      fontSize: _ShellPageState._miniNavLabelFontSize,
    );
    const miniItemSpacing = _ShellPageState._miniNavItemSpacing;
    const miniIconSize = _ShellPageState._miniNavIconSize;

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
                      item.onPressed?.call();
                    }
                  }
                : null,
            label: isCompact && showCompactLabels
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
                ? _buildCompactNavIcon(
                    icon: item.icon,
                    semanticLabel: item.label,
                    itemIndex: entry.$1,
                    iconSize: miniIconSize,
                  )
                : _buildHorizontalNavItem(
                    icon: item.icon,
                    label: item.label,
                    style: miniLabelStyle,
                    itemIndex: entry.$1,
                    iconSize: miniIconSize,
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

  Key? _selectedKeyForLocation(String location) {
    if (location == Routes.home) {
      return _ShellPageState._homeKey;
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
        location == Routes.apps;
  }
}

class _StaggeredNavElement extends StatefulWidget {
  const _StaggeredNavElement({
    required this.itemIndex,
    required this.slotDelay,
    required this.child,
  });

  static const _duration = Duration(milliseconds: 220);
  static const _baseDelayMs = 90;
  static const _itemDelayMs = 65;

  final int itemIndex;
  final double slotDelay;
  final Widget child;

  @override
  State<_StaggeredNavElement> createState() => _StaggeredNavElementState();
}

class _StaggeredNavElementState extends State<_StaggeredNavElement>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _curvedAnimation;
  late final Animation<Offset> _offsetAnimation;
  late final Animation<double> _scaleAnimation;
  Timer? _startTimer;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: _StaggeredNavElement._duration,
    );
    _curvedAnimation = _controller.drive(
      CurveTween(curve: Curves.easeOutCubic),
    );
    _offsetAnimation = _curvedAnimation.drive(
      Tween<Offset>(begin: const Offset(0, 0.18), end: Offset.zero),
    );
    _scaleAnimation = _curvedAnimation.drive(
      Tween<double>(begin: 0.98, end: 1),
    );
    _scheduleEntrance();
  }

  Duration get _delay => Duration(
    milliseconds:
        _StaggeredNavElement._baseDelayMs +
        (widget.itemIndex * _StaggeredNavElement._itemDelayMs) +
        (widget.slotDelay * 1000).round(),
  );

  void _scheduleEntrance() {
    _startTimer?.cancel();
    _controller.value = 0;
    _startTimer = Timer(_delay, () {
      if (!mounted) {
        return;
      }
      unawaited(_controller.forward(from: 0));
    });
  }

  @override
  void didUpdateWidget(covariant _StaggeredNavElement oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.itemIndex != widget.itemIndex ||
        oldWidget.slotDelay != widget.slotDelay) {
      _scheduleEntrance();
    }
  }

  @override
  void dispose() {
    _startTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _curvedAnimation,
      child: SlideTransition(
        position: _offsetAnimation,
        child: ScaleTransition(scale: _scaleAnimation, child: widget.child),
      ),
    );
  }
}

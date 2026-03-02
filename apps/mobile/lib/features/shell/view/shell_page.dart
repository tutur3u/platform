import 'dart:async';

import 'package:flutter/material.dart'
    hide NavigationBar, NavigationBarTheme, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/cubit/app_tab_state.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/widgets/workspace_selector_button.dart';
import 'package:mobile/features/dashboard/view/dashboard_page.dart';
import 'package:mobile/features/shell/view/avatar_dropdown.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Shell layout with adaptive navigation.
///
/// Wraps all tab-level routes via GoRouter's [ShellRoute].
/// - **compact** → bottom [shad.NavigationBar]
/// - **medium**  → side [shad.NavigationRail]
/// - **expanded** → side [shad.NavigationSidebar]
class ShellPage extends StatefulWidget {
  const ShellPage({
    required this.child,
    required this.matchedLocation,
    super.key,
  });

  final Widget child;
  final String matchedLocation;

  @override
  State<ShellPage> createState() => _ShellPageState();
}

class _ShellPageState extends State<ShellPage> {
  static const ValueKey<String> _homeKey = ValueKey('home');
  static const ValueKey<String> _appsKey = ValueKey('apps');
  static const ValueKey<String> _assistantKey = ValueKey('assistant');
  static const ValueKey<String> _globalLayerKey = ValueKey('global-layer');
  static const ValueKey<String> _miniLayerKey = ValueKey('mini-layer');
  static const ValueKey<String> _backToRootKey = ValueKey('back-to-root');
  static const double _navIconSize = 22;

  final Stopwatch _tapStopwatch = Stopwatch();
  int? _lastTabIndex;
  Timer? _longPressTimer;
  final GlobalKey _appsTabKey = GlobalKey();
  DateTime? _lastAppsTabPointerUpAt;
  late final PageController _layerController;
  Widget? _cachedGlobalBody;
  int _activeLayerPage = 1;
  bool _syncingLayerPage = false;
  bool _showMiniNav = true;
  String? _lastLayeredLocation;

  DateTime? _lastBackToRootTapAt;

  bool _isAppsTabHit(Offset position) {
    final ctx = _appsTabKey.currentContext;
    if (ctx == null) return false;
    final renderBox = ctx.findRenderObject() as RenderBox?;
    if (renderBox == null || !renderBox.hasSize) return false;
    final overlay = Overlay.of(ctx).context.findRenderObject() as RenderBox?;
    if (overlay == null) return false;
    final topLeft = renderBox.localToGlobal(Offset.zero, ancestor: overlay);
    final bounds = topLeft & renderBox.size;
    return bounds.contains(position);
  }

  @override
  void initState() {
    super.initState();
    _layerController = PageController(initialPage: 1);
  }

  @override
  Widget build(BuildContext context) {
    final deviceClass = context.deviceClass;
    final location = widget.matchedLocation;
    final activeModule = AppRegistry.moduleFromLocation(location);

    return BlocBuilder<AppTabCubit, AppTabState>(
      builder: (context, state) {
        if (deviceClass == DeviceClass.compact) {
          return _buildCompactLayout(
            context,
            state,
            activeModule: activeModule,
          );
        }
        return _buildSideNavLayout(context, state, deviceClass);
      },
    );
  }

  Widget _buildNormalizedChild({bool preserveTop = false}) {
    if (preserveTop) return widget.child;
    return MediaQuery.removePadding(
      context: context,
      removeTop: true,
      child: widget.child,
    );
  }

  /// Compact: bottom NavigationBar inside Scaffold footers.
  Widget _buildCompactLayout(
    BuildContext context,
    AppTabState state, {
    required AppModule? activeModule,
  }) {
    final isMiniAppRoute = activeModule != null;
    if (!isMiniAppRoute) {
      _cachedGlobalBody = _buildNormalizedChild();
      _activeLayerPage = 0;
      if (_layerController.hasClients && _layerController.page?.round() != 0) {
        _syncingLayerPage = true;
        unawaited(
          _layerController
              .animateToPage(
                0,
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
              )
              .catchError((_) {})
              .whenComplete(() {
                if (!mounted) return;
                setState(() => _syncingLayerPage = false);
              }),
        );
      } else {
        _syncingLayerPage = false;
      }
      return _buildGlobalCompactScaffold(context, state);
    }

    if (_activeLayerPage != 1) {
      _activeLayerPage = 1;
    }

    // Reset to mini nav whenever the user navigates to a new mini-app location.
    if (widget.matchedLocation != _lastLayeredLocation) {
      _lastLayeredLocation = widget.matchedLocation;
      _showMiniNav = true;
    }

    return _buildLayeredCompactLayout(context, state, activeModule);
  }

  Widget _buildGlobalCompactScaffold(BuildContext context, AppTabState state) {
    final l10n = context.l10n;
    final items = _buildNavItems(context, state, l10n);
    final selectedIndex = _calculateSelectedIndex(widget.matchedLocation);
    final selectedKey = _keyForIndex(selectedIndex);

    return shad.Scaffold(
      headers: [_buildAppBar(context)],
      footers: [
        SafeArea(
          top: false,
          child: SizedBox(
            width: double.infinity,
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: Listener(
                  behavior: HitTestBehavior.translucent,
                  onPointerDown: _startLongPressTimer,
                  onPointerUp: _handlePointerUp,
                  onPointerCancel: _stopLongPressTimer,
                  child: shad.NavigationBar(
                    selectedKey: selectedKey,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    onSelected: (key) =>
                        _onItemTapped(_indexForKey(key), context, state),
                    children: items.map((i) => Expanded(child: i)).toList(),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
      child: _buildNormalizedChild(),
    );
  }

  Widget _buildLayeredCompactLayout(
    BuildContext context,
    AppTabState state,
    AppModule activeModule,
  ) {
    if (_layerController.hasClients && _layerController.page?.round() != 1) {
      _syncingLayerPage = true;
      unawaited(
        _layerController
            .animateToPage(
              1,
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
            )
            .catchError((_) {})
            .whenComplete(() {
              if (!mounted) return;
              setState(() => _syncingLayerPage = false);
            }),
      );
    } else {
      _syncingLayerPage = false;
    }

    final globalBody = _cachedGlobalBody ?? const DashboardPage();
    final miniItems = _buildMiniAppNavItems(context, activeModule);
    final miniSelectedKey = _miniSelectedKey(
      context,
      activeModule.miniAppNavItems,
    );

    return shad.Scaffold(
      footers: [
        SafeArea(
          top: false,
          child: SizedBox(
            width: double.infinity,
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: GestureDetector(
                  behavior: HitTestBehavior.translucent,
                  onHorizontalDragEnd: _onNavBarHorizontalDragEnd,
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 180),
                    switchInCurve: Curves.easeOutCubic,
                    switchOutCurve: Curves.easeInCubic,
                    child: _showMiniNav
                        ? shad.NavigationBar(
                            key: _miniLayerKey,
                            selectedKey: miniSelectedKey,
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            onSelected: (key) => _onMiniAppItemTapped(
                              key,
                              context,
                              activeModule,
                            ),
                            children: miniItems,
                          )
                        : shad.NavigationBar(
                            key: _globalLayerKey,
                            // No selectedKey: none of the global tabs is
                            // truly active while inside a mini-app, and
                            // passing one would suppress taps on it.
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            onSelected: (key) => _onItemTapped(
                              _indexForKey(key),
                              context,
                              state,
                            ),
                            children: _buildNavItems(
                              context,
                              state,
                              context.l10n,
                            ).map((i) => Expanded(child: i)).toList(),
                          ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
      child: PageView(
        controller: _layerController,
        physics: const NeverScrollableScrollPhysics(),
        onPageChanged: (page) {
          if (!mounted) return;
          setState(() {
            _activeLayerPage = page;
            _syncingLayerPage = false;
          });
        },
        children: [
          KeyedSubtree(key: _globalLayerKey, child: globalBody),
          KeyedSubtree(
            key: _miniLayerKey,
            child: _buildNormalizedChild(preserveTop: true),
          ),
        ],
      ),
    );
  }

  /// Medium / Expanded: side NavigationRail or NavigationSidebar.
  Widget _buildSideNavLayout(
    BuildContext context,
    AppTabState state,
    DeviceClass deviceClass,
  ) {
    final l10n = context.l10n;
    final selectedIndex = _calculateSelectedIndex(widget.matchedLocation);
    final selectedKey = _keyForIndex(selectedIndex, useGlobalKey: false);
    final moduleRoute = _isModuleRoute(widget.matchedLocation);
    void onSelected(Key? key) =>
        _onItemTapped(_indexForKey(key), context, state);

    // Use non-GlobalKey for rail/sidebar items (no long-press detection).
    final items = _buildNavItems(context, state, l10n, useGlobalKey: false);

    final Widget sideNav;
    if (deviceClass == DeviceClass.expanded) {
      sideNav = shad.NavigationSidebar(
        selectedKey: selectedKey,
        onSelected: onSelected,
        children: items,
      );
    } else {
      sideNav = shad.NavigationRail(
        selectedKey: selectedKey,
        onSelected: onSelected,
        children: items,
      );
    }

    return shad.Scaffold(
      headers: moduleRoute ? const [] : [_buildAppBar(context)],
      child: Row(
        children: [
          sideNav,
          Expanded(child: _buildNormalizedChild(preserveTop: moduleRoute)),
        ],
      ),
    );
  }

  shad.AppBar _buildAppBar(BuildContext context) {
    return const shad.AppBar(
      title: WorkspaceSelectorButton(),
      trailing: [AvatarDropdown()],
    );
  }

  /// Builds the three navigation items.
  ///
  /// When [useGlobalKey] is true (compact mode), the Apps item uses the
  /// [_appsTabKey] GlobalKey for long-press hit testing.
  List<shad.NavigationItem> _buildNavItems(
    BuildContext context,
    AppTabState state,
    AppLocalizations l10n, {
    bool useGlobalKey = true,
  }) {
    final theme = shad.Theme.of(context);
    final labelStyle = theme.typography.p.copyWith(
      fontSize: 12,
      fontWeight: FontWeight.normal,
    );

    final selectedModule = state.hasSelection
        ? AppRegistry.moduleById(state.selectedId)
        : null;
    final appsLabel = selectedModule?.label(l10n) ?? l10n.navApps;
    final appsIcon = selectedModule?.icon ?? Icons.apps_outlined;

    return [
      shad.NavigationItem(
        key: _homeKey,
        label: _buildNavLabel(l10n.navHome, labelStyle),
        child: const Icon(Icons.home_outlined, size: _navIconSize),
      ),
      shad.NavigationItem(
        key: _assistantKey,
        label: _buildNavLabel(l10n.navAssistant, labelStyle),
        child: const Icon(Icons.auto_awesome_outlined, size: _navIconSize),
      ),
      shad.NavigationItem(
        key: useGlobalKey ? _appsTabKey : _appsKey,
        label: _buildNavLabel(appsLabel, labelStyle),
        child: Icon(appsIcon, size: _navIconSize),
      ),
    ];
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

  @override
  void dispose() {
    _stopLongPressTimer();
    _layerController.dispose();
    super.dispose();
  }

  List<Widget> _buildMiniAppNavItems(
    BuildContext context,
    AppModule module,
  ) {
    final theme = shad.Theme.of(context);
    final labelStyle = theme.typography.p.copyWith(
      fontSize: 12,
      fontWeight: FontWeight.normal,
    );
    final l10n = context.l10n;

    return [
      const Expanded(
        child: shad.NavigationItem(
          key: _backToRootKey,
          child: Icon(Icons.chevron_left, size: _navIconSize),
        ),
      ),
      ...module.miniAppNavItems.map(
        (item) => Expanded(
          child: shad.NavigationItem(
            key: _miniNavKey(module.id, item.id),
            label: _buildNavLabel(item.label(l10n), labelStyle),
            child: Icon(item.icon, size: _navIconSize),
          ),
        ),
      ),
    ];
  }

  ValueKey<String> _miniNavKey(String moduleId, String itemId) =>
      ValueKey<String>('mini-nav-$moduleId-$itemId');

  Key _miniSelectedKey(BuildContext context, List<MiniAppNavItem> items) {
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

  Future<void> _onMiniAppItemTapped(
    Key? key,
    BuildContext context,
    AppModule activeModule,
  ) async {
    if (key == _backToRootKey) {
      final now = DateTime.now();
      final last = _lastBackToRootTapAt;
      final isDoubleTap =
          last != null &&
          now.difference(last) < const Duration(milliseconds: 300);
      _lastBackToRootTapAt = isDoubleTap ? null : now;
      if (isDoubleTap) {
        // Double-tap: go straight to the apps drawer.
        await _openAppsDrawerFromAppsTab();
      } else {
        setState(() => _showMiniNav = false);
      }
      return;
    }

    final selected = activeModule.miniAppNavItems.firstWhere(
      (item) => _miniNavKey(activeModule.id, item.id) == key,
      orElse: () => activeModule.miniAppNavItems.first,
    );

    if (!context.mounted) {
      return;
    }

    context.go(selected.route);
    await context.read<AppTabCubit>().setLastTabRoute(selected.route);

    if (_activeLayerPage == 0) {
      await _setActiveLayerPage(1);
    }
  }

  void _onNavBarHorizontalDragEnd(DragEndDetails details) {
    final velocity = details.primaryVelocity ?? 0;
    if (velocity > 250) {
      setState(() => _showMiniNav = false);
      return;
    }
    if (velocity < -250) {
      setState(() => _showMiniNav = true);
    }
  }

  Future<void> _setActiveLayerPage(int page) async {
    if (_activeLayerPage == page || _syncingLayerPage) {
      return;
    }

    _syncingLayerPage = true;
    final currentPage = _layerController.hasClients
        ? _layerController.page?.round()
        : null;

    if (!_layerController.hasClients || currentPage == page) {
      if (mounted) {
        setState(() {
          _activeLayerPage = page;
          _syncingLayerPage = false;
        });
      } else {
        _activeLayerPage = page;
        _syncingLayerPage = false;
      }
      return;
    }

    try {
      await _layerController.animateToPage(
        page,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
      );
    } on Exception {
      // no-op: ensure syncing flag is reset in finally
    } finally {
      if (mounted) {
        setState(() {
          _activeLayerPage = page;
          _syncingLayerPage = false;
        });
      } else {
        _activeLayerPage = page;
        _syncingLayerPage = false;
      }
    }
  }

  void _handleAppsLongPress() {
    if (!mounted) return;
    unawaited(context.read<AppTabCubit>().openWithSearch());
    context.go(Routes.apps);
  }

  Future<void> _openAppsDrawerFromAppsTab() async {
    final currentContext = context;
    final appTabCubit = currentContext.read<AppTabCubit>();
    await appTabCubit.clearSelection();
    if (!currentContext.mounted) {
      return;
    }
    currentContext.go(Routes.apps);
    _lastTabIndex = 2;
    _tapStopwatch
      ..reset()
      ..start();
  }

  Future<void> _onItemTapped(
    int index,
    BuildContext context,
    AppTabState state,
  ) async {
    final appTabCubit = context.read<AppTabCubit>();
    final appRoute = state.hasSelection
        ? AppRegistry.moduleById(state.selectedId)?.route
        : null;
    final isDoubleTap =
        _lastTabIndex == index &&
        _tapStopwatch.isRunning &&
        _tapStopwatch.elapsed < const Duration(milliseconds: 300);

    if (index == 2 && isDoubleTap) {
      await _openAppsDrawerFromAppsTab();
      return;
    }

    // When the global nav is shown as an overlay over a mini-app route
    // (user tapped the back-to-root "Apps" button), tapping Apps again
    // returns to the mini nav without leaving the current page.
    if (index == 2 &&
        !_showMiniNav &&
        AppRegistry.moduleFromLocation(widget.matchedLocation) != null) {
      setState(() => _showMiniNav = true);
      return;
    }

    final route = switch (index) {
      1 => Routes.assistant,
      2 => appRoute ?? Routes.apps,
      _ => Routes.home,
    };
    if (!context.mounted) {
      return;
    }
    context.go(route);
    await appTabCubit.setLastTabRoute(route);
    if (!context.mounted) {
      return;
    }
    _lastTabIndex = index;
    _tapStopwatch
      ..reset()
      ..start();
  }

  void _startLongPressTimer(PointerDownEvent event) {
    if (!_isAppsTabHit(event.position)) return;
    _stopLongPressTimer();
    _longPressTimer = Timer(
      const Duration(milliseconds: 500),
      _handleAppsLongPress,
    );
  }

  void _handlePointerUp(PointerUpEvent event) {
    _stopLongPressTimer();
    if (!_isAppsTabHit(event.position)) {
      return;
    }

    final now = DateTime.now();
    final lastTap = _lastAppsTabPointerUpAt;
    final isCompactAppsReselection =
        _calculateSelectedIndex(widget.matchedLocation) == 2;
    if (isCompactAppsReselection &&
        lastTap != null &&
        now.difference(lastTap) < const Duration(milliseconds: 300)) {
      _lastAppsTabPointerUpAt = null;
      unawaited(_openAppsDrawerFromAppsTab());
      return;
    }
    _lastAppsTabPointerUpAt = now;
  }

  void _stopLongPressTimer([PointerEvent? _]) {
    _longPressTimer?.cancel();
    _longPressTimer = null;
  }

  Key _keyForIndex(int index, {bool useGlobalKey = true}) => switch (index) {
    1 => _assistantKey,
    2 => useGlobalKey ? _appsTabKey : _appsKey,
    _ => _homeKey,
  };

  static int _indexForKey(Key? key) {
    if (key == _assistantKey) return 1;
    if (key == _appsKey || key is GlobalKey) return 2;
    return 0;
  }

  static int _calculateSelectedIndex(String location) {
    if (location.startsWith(Routes.assistant)) return 1;
    if (location.startsWith(Routes.apps)) return 2;
    if (AppRegistry.moduleFromLocation(location) != null) return 2;
    return 0; // home
  }

  static bool _isModuleRoute(String location) {
    return AppRegistry.moduleFromLocation(location) != null;
  }
}

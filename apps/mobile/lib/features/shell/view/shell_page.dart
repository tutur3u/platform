import 'dart:async';

import 'package:flutter/material.dart'
    hide NavigationBar, NavigationBarTheme, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/cubit/app_tab_state.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/view/apps_hub_page.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/view/assistant_page.dart';
import 'package:mobile/features/dashboard/view/dashboard_page.dart';
import 'package:mobile/features/shell/view/avatar_dropdown.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
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
  static const double _navItemSpacing = 2;

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
    final location = widget.matchedLocation;
    final activeModule = AppRegistry.moduleFromLocation(location);

    return BlocBuilder<AppTabCubit, AppTabState>(
      builder: (context, state) => _buildCompactLayout(
        context,
        state,
        activeModule: activeModule,
      ),
    );
  }

  Widget _buildNormalizedChild({bool preserveTop = false}) {
    // Wrap in SizedBox.expand to ensure child fills available space
    return SizedBox.expand(
      child: widget.child,
    );
  }

  Widget _buildGlobalBody() {
    if (_isRootTabLocation(widget.matchedLocation)) {
      return MediaQuery.removePadding(
        context: context,
        removeTop: true,
        child: IndexedStack(
          index: _rootTabIndex(widget.matchedLocation),
          children: const [
            DashboardPage(),
            AssistantPage(),
            AppsHubPage(),
          ],
        ),
      );
    }
    return _buildNormalizedChild();
  }

  /// Build navigation bar with dynamic island styling for tablets.
  Widget _buildFloatingNavigationBar({
    required BuildContext context,
    required bool isCompact,
    required Widget child,
  }) {
    if (isCompact) {
      return child;
    }

    final theme = shad.Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 40, vertical: 24),
      decoration: BoxDecoration(
        color: theme.colorScheme.background,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.4 : 0.12),
            blurRadius: 40,
            offset: const Offset(0, 12),
          ),
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.08),
            blurRadius: 12,
            offset: const Offset(0, 4),
            spreadRadius: -2,
          ),
        ],
      ),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: isDark
                ? Colors.white.withValues(alpha: 0.1)
                : Colors.black.withValues(alpha: 0.08),
          ),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: child,
        ),
      ),
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
      _cachedGlobalBody = _buildGlobalBody();
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
    final selectedKey = _selectedKeyForLocation(widget.matchedLocation);
    final assistantChrome = context.watch<AssistantChromeCubit>().state;
    final showBottomNav =
        !widget.matchedLocation.startsWith(Routes.assistant) ||
        !assistantChrome.isFullscreen;
    final isCompact = context.isCompact;

    return shad.Scaffold(
      headers: [_buildAppBar(context)],
      footers: showBottomNav
          ? [
              SafeArea(
                top: false,
                child: SizedBox(
                  width: double.infinity,
                  child: Center(
                    child: ConstrainedBox(
                      constraints: BoxConstraints(
                        maxWidth: isCompact ? 560 : 720,
                      ),
                      child: _buildFloatingNavigationBar(
                        context: context,
                        isCompact: isCompact,
                        child: Listener(
                          behavior: HitTestBehavior.translucent,
                          onPointerDown: _startLongPressTimer,
                          onPointerUp: _handlePointerUp,
                          onPointerCancel: _stopLongPressTimer,
                          child: isCompact
                              ? shad.NavigationBar(
                                  selectedKey: selectedKey,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 4,
                                  ),
                                  onSelected: (key) => _onItemTapped(
                                    _indexForKey(key),
                                    context,
                                    state,
                                  ),
                                  children: items
                                      .map((i) => Expanded(child: i))
                                      .toList(),
                                )
                              : _CustomNavigationBar(
                                  selectedKey: selectedKey,
                                  onSelected: (key) => _onItemTapped(
                                    _indexForKey(key),
                                    context,
                                    state,
                                  ),
                                  children: items,
                                ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ]
          : const [],
      child: _buildGlobalBody(),
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
    final isCompact = context.isCompact;

    return shad.Scaffold(
      footers: [
        SafeArea(
          top: false,
          child: SizedBox(
            width: double.infinity,
            child: Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: isCompact ? 560 : 720,
                ),
                child: _buildFloatingNavigationBar(
                  context: context,
                  isCompact: isCompact,
                  child: GestureDetector(
                    behavior: HitTestBehavior.translucent,
                    onHorizontalDragEnd: _onNavBarHorizontalDragEnd,
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 180),
                      switchInCurve: Curves.easeOutCubic,
                      switchOutCurve: Curves.easeInCubic,
                      child: _showMiniNav
                          ? (isCompact
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
                                : _CustomNavigationBar(
                                    key: _miniLayerKey,
                                    selectedKey: miniSelectedKey,
                                    onSelected: (key) => _onMiniAppItemTapped(
                                      key,
                                      context,
                                      activeModule,
                                    ),
                                    children: miniItems,
                                  ))
                          : Listener(
                              behavior: HitTestBehavior.translucent,
                              onPointerDown: _startLongPressTimer,
                              onPointerUp: _stopLongPressTimer,
                              onPointerCancel: _stopLongPressTimer,
                              child: isCompact
                                  ? shad.NavigationBar(
                                      key: _globalLayerKey,
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
                                    )
                                  : _CustomNavigationBar(
                                      key: _globalLayerKey,
                                      onSelected: (key) => _onItemTapped(
                                        _indexForKey(key),
                                        context,
                                        state,
                                      ),
                                      children: _buildNavItems(
                                        context,
                                        state,
                                        context.l10n,
                                      ),
                                    ),
                            ),
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

  shad.AppBar _buildAppBar(BuildContext context) {
    return shad.AppBar(
      height: mobileSectionAppBarHeight,
      padding: mobileSectionAppBarPadding,
      trailingGap: 6,
      trailing: const [AvatarDropdown()],
      child: _ShellTopBarTitle(matchedLocation: widget.matchedLocation),
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
      fontWeight: FontWeight.w600,
    );
    final isCompact = context.isCompact;

    return [
      shad.NavigationItem(
        key: _homeKey,
        spacing: _navItemSpacing,
        label: isCompact ? _buildNavLabel(l10n.navHome, labelStyle) : null,
        child: isCompact
            ? const Icon(Icons.home_outlined, size: _navIconSize)
            : _buildHorizontalNavItem(
                icon: Icons.home_outlined,
                label: l10n.navHome,
                style: labelStyle,
              ),
      ),
      shad.NavigationItem(
        key: _assistantKey,
        spacing: _navItemSpacing,
        label: isCompact ? _buildNavLabel(l10n.navAssistant, labelStyle) : null,
        child: isCompact
            ? const Icon(Icons.auto_awesome_outlined, size: _navIconSize)
            : _buildHorizontalNavItem(
                icon: Icons.auto_awesome_outlined,
                label: l10n.navAssistant,
                style: labelStyle,
              ),
      ),
      shad.NavigationItem(
        key: useGlobalKey ? _appsTabKey : _appsKey,
        spacing: _navItemSpacing,
        label: isCompact ? _buildNavLabel(l10n.navApps, labelStyle) : null,
        child: isCompact
            ? const Icon(Icons.apps_outlined, size: _navIconSize)
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
        Icon(icon, size: _navIconSize),
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
      fontWeight: FontWeight.w600,
    );
    final l10n = context.l10n;
    final isCompact = context.isCompact;

    return [
      Expanded(
        child: shad.NavigationItem(
          key: _backToRootKey,
          spacing: _navItemSpacing,
          alignment: Alignment.center,
          marginAlignment: Alignment.center,
          label: isCompact ? _buildNavLabel(l10n.navBack, labelStyle) : null,
          child: isCompact
              ? const Icon(Icons.chevron_left, size: _navIconSize)
              : _buildHorizontalNavItem(
                  icon: Icons.chevron_left,
                  label: l10n.navBack,
                  style: labelStyle,
                ),
        ),
      ),
      ...module.miniAppNavItems.map(
        (item) => Expanded(
          child: shad.NavigationItem(
            key: _miniNavKey(module.id, item.id),
            spacing: _navItemSpacing,
            label: isCompact
                ? _buildNavLabel(item.label(l10n), labelStyle)
                : null,
            child: isCompact
                ? Icon(item.icon, size: _navIconSize)
                : _buildHorizontalNavItem(
                    icon: item.icon,
                    label: item.label(l10n),
                    style: labelStyle,
                  ),
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
      await _openAppsDrawerFromAppsTab();
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
    final isDoubleTap =
        _lastTabIndex == index &&
        _tapStopwatch.isRunning &&
        _tapStopwatch.elapsed < const Duration(milliseconds: 300);

    if (index == 2 && isDoubleTap) {
      await _openAppsDrawerFromAppsTab();
      return;
    }

    if (index == 2) {
      await _openAppsDrawerFromAppsTab();
      return;
    }

    final route = switch (index) {
      1 => Routes.assistant,
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

  Key? _selectedKeyForLocation(String location, {bool useGlobalKey = true}) {
    if (location == Routes.home) {
      return _homeKey;
    }
    if (location == Routes.assistant) {
      return _assistantKey;
    }
    if (location == Routes.apps ||
        AppRegistry.moduleFromLocation(location) != null) {
      return useGlobalKey ? _appsTabKey : _appsKey;
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
}

/// Custom navigation bar with pill-shaped selection indicators.
/// Matches outer container border radius for first/last items.
class _CustomNavigationBar extends StatelessWidget {
  const _CustomNavigationBar({
    required this.children,
    super.key,
    this.selectedKey,
    this.onSelected,
  });

  final List<Widget> children;
  final Key? selectedKey;
  final ValueChanged<Key?>? onSelected;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: List.generate(children.length, (index) {
          final child = children[index];
          final isFirst = index == 0;
          final isLast = index == children.length - 1;

          // Extract key from NavigationItem
          Key? itemKey;
          if (child is shad.NavigationItem) {
            itemKey = child.key;
          }

          final isSelected = itemKey == selectedKey;

          return Expanded(
            child: Padding(
              padding: EdgeInsets.only(
                left: isFirst ? 0 : 2,
                right: isLast ? 0 : 2,
              ),
              child: _CustomNavItem(
                isFirst: isFirst,
                isLast: isLast,
                isSelected: isSelected,
                theme: theme,
                isDark: isDark,
                onTap: () => onSelected?.call(itemKey),
                child: child,
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _CustomNavItem extends StatelessWidget {
  const _CustomNavItem({
    required this.child,
    required this.isFirst,
    required this.isLast,
    required this.isSelected,
    required this.theme,
    required this.isDark,
    this.onTap,
  });

  final Widget child;
  final bool isFirst;
  final bool isLast;
  final bool isSelected;
  final shad.ThemeData theme;
  final bool isDark;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    // Extract content from NavigationItem
    var content = child;
    if (child is shad.NavigationItem) {
      final navItem = child as shad.NavigationItem;
      content = navItem.child;
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: _getBorderRadius(),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
          decoration: BoxDecoration(
            color: isSelected
                ? (isDark
                      ? Colors.white.withValues(alpha: 0.12)
                      : Colors.black.withValues(alpha: 0.08))
                : Colors.transparent,
            borderRadius: _getBorderRadius(),
          ),
          child: Center(child: content),
        ),
      ),
    );
  }

  BorderRadius _getBorderRadius() {
    // Pill shape: full radius on outer edges, smaller on inner edges
    if (isFirst && isLast) {
      // Single item - full pill
      return BorderRadius.circular(20);
    } else if (isFirst) {
      // First item - rounded left, flat right
      return const BorderRadius.horizontal(
        left: Radius.circular(20),
        right: Radius.circular(4),
      );
    } else if (isLast) {
      // Last item - flat left, rounded right
      return const BorderRadius.horizontal(
        left: Radius.circular(4),
        right: Radius.circular(20),
      );
    } else {
      // Middle items - slightly rounded both sides
      return BorderRadius.circular(4);
    }
  }
}

class _ShellTopBarTitle extends StatelessWidget {
  const _ShellTopBarTitle({required this.matchedLocation});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    // Check for module routes first
    final module = AppRegistry.moduleFromLocation(matchedLocation);
    if (module != null) {
      return _buildTitleRow(theme, module.label(context.l10n));
    }

    final title = switch (matchedLocation) {
      Routes.home => context.l10n.navHome,
      Routes.assistant => 'Assistant',
      Routes.profileRoot => context.l10n.profileTitle,
      Routes.settings => context.l10n.settingsTitle,
      Routes.apps => context.l10n.navApps,
      _ => null,
    };

    return _buildTitleRow(theme, title ?? context.l10n.navApps);
  }

  Widget _buildTitleRow(shad.ThemeData theme, String title) {
    return SizedBox(
      height: mobileSectionAppBarHeight,
      child: Row(
        children: [
          Image.asset(
            'assets/logos/transparent.png',
            width: mobileSectionAppBarLogoSize,
            height: mobileSectionAppBarLogoSize,
            fit: BoxFit.contain,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.typography.large.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

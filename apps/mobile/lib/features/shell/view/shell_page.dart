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
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/apps/widgets/workspace_selector_button.dart';
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
  const ShellPage({required this.child, super.key});

  final Widget child;

  @override
  State<ShellPage> createState() => _ShellPageState();
}

class _ShellPageState extends State<ShellPage> {
  static const ValueKey<String> _homeKey = ValueKey('home');
  static const ValueKey<String> _appsKey = ValueKey('apps');
  static const ValueKey<String> _assistantKey = ValueKey('assistant');
  static const double _compactNavLabelWidth = 92;
  static const double _navIconSize = 22;

  final Stopwatch _tapStopwatch = Stopwatch();
  int? _lastTabIndex;
  Timer? _longPressTimer;
  final GlobalKey _appsTabKey = GlobalKey();
  DateTime? _lastAppsTabPointerUpAt;

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
  Widget build(BuildContext context) {
    final deviceClass = context.deviceClass;

    return BlocBuilder<AppTabCubit, AppTabState>(
      builder: (context, state) {
        if (deviceClass == DeviceClass.compact) {
          return _buildCompactLayout(context, state);
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
  Widget _buildCompactLayout(BuildContext context, AppTabState state) {
    final l10n = context.l10n;
    final items = _buildNavItems(context, state, l10n);
    final selectedIndex = _calculateSelectedIndex(context);
    final selectedKey = _keyForIndex(selectedIndex);
    final moduleRoute = _isModuleRoute(context);

    return shad.Scaffold(
      headers: moduleRoute ? const [] : [_buildAppBar(context)],
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
                    alignment: shad.NavigationBarAlignment.spaceEvenly,
                    onSelected: (key) =>
                        _onItemTapped(_indexForKey(key), context, state),
                    children: items,
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
      child: _buildNormalizedChild(preserveTop: moduleRoute),
    );
  }

  /// Medium / Expanded: side NavigationRail or NavigationSidebar.
  Widget _buildSideNavLayout(
    BuildContext context,
    AppTabState state,
    DeviceClass deviceClass,
  ) {
    final l10n = context.l10n;
    final selectedIndex = _calculateSelectedIndex(context);
    final selectedKey = _keyForIndex(selectedIndex, useGlobalKey: false);
    final moduleRoute = _isModuleRoute(context);
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
    final compact = useGlobalKey;

    return [
      shad.NavigationItem(
        key: _homeKey,
        label: _buildNavLabel(l10n.navHome, labelStyle, compact: compact),
        child: const Icon(Icons.home_outlined, size: _navIconSize),
      ),
      shad.NavigationItem(
        key: _assistantKey,
        label: _buildNavLabel(l10n.navAssistant, labelStyle, compact: compact),
        child: const Icon(Icons.auto_awesome_outlined, size: _navIconSize),
      ),
      shad.NavigationItem(
        key: useGlobalKey ? _appsTabKey : _appsKey,
        label: _buildNavLabel(appsLabel, labelStyle, compact: compact),
        child: Icon(appsIcon, size: _navIconSize),
      ),
    ];
  }

  Widget _buildNavLabel(String text, TextStyle style, {required bool compact}) {
    final label = Text(
      text,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      textAlign: TextAlign.center,
      style: style,
    );
    if (!compact) return label;
    return SizedBox(width: _compactNavLabelWidth, child: label);
  }

  @override
  void dispose() {
    _stopLongPressTimer();
    super.dispose();
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
    final isCompactAppsReselection = _calculateSelectedIndex(context) == 2;
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

  static int _calculateSelectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;

    if (location.startsWith(Routes.assistant)) return 1;
    if (location.startsWith(Routes.apps)) return 2;
    if (AppRegistry.moduleFromLocation(location) != null) return 2;
    return 0; // home
  }

  static bool _isModuleRoute(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    return AppRegistry.moduleFromLocation(location) != null;
  }
}

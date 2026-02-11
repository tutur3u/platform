import 'dart:async';

import 'package:flutter/material.dart'
    hide NavigationBar, NavigationBarTheme, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/apps/cubit/app_tab_state.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Shell layout with bottom navigation bar.
///
/// Wraps all tab-level routes via GoRouter's [ShellRoute].
class ShellPage extends StatefulWidget {
  const ShellPage({required this.child, super.key});

  final Widget child;

  @override
  State<ShellPage> createState() => _ShellPageState();
}

class _ShellPageState extends State<ShellPage> {
  final Stopwatch _tapStopwatch = Stopwatch();
  int? _lastTabIndex;
  Timer? _longPressTimer;
  final GlobalKey _appsTabKey = GlobalKey();

  bool _isAppsTabHit(Offset position) {
    final context = _appsTabKey.currentContext;
    if (context == null) return false;
    final renderBox = context.findRenderObject() as RenderBox?;
    if (renderBox == null || !renderBox.hasSize) return false;
    final overlay =
        Overlay.of(context).context.findRenderObject() as RenderBox?;
    if (overlay == null) return false;
    final topLeft = renderBox.localToGlobal(Offset.zero, ancestor: overlay);
    final bounds = topLeft & renderBox.size;
    return bounds.contains(position);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final selectedIndex = _calculateSelectedIndex(context);
    final theme = shad.Theme.of(context);
    final labelStyle = theme.typography.p.copyWith(
      fontSize: 12,
      fontWeight: FontWeight.normal,
    );

    return shad.Scaffold(
      footers: [
        BlocBuilder<AppTabCubit, AppTabState>(
          builder: (context, state) {
            final selectedModule = state.hasSelection
                ? AppRegistry.moduleById(state.selectedId)
                : null;
            final appsLabel = selectedModule?.label(l10n) ?? l10n.navApps;
            final appsIcon = selectedModule?.icon ?? Icons.apps_outlined;

            return Listener(
              behavior: HitTestBehavior.translucent,
              onPointerDown: _startLongPressTimer,
              onPointerUp: _stopLongPressTimer,
              onPointerCancel: _stopLongPressTimer,
              child: shad.NavigationBar(
                index: selectedIndex,
                onSelected: (index) => _onItemTapped(index, context, state),
                labelType: shad.NavigationLabelType.all,
                children: [
                  shad.NavigationItem(
                    label: Text(
                      l10n.navHome,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: labelStyle,
                    ),
                    child: const Icon(Icons.home_outlined),
                  ),
                  shad.NavigationItem(
                    key: _appsTabKey,
                    label: Text(
                      appsLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: labelStyle,
                    ),
                    child: Icon(appsIcon),
                  ),
                  shad.NavigationItem(
                    label: Text(
                      l10n.settingsProfile,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: labelStyle,
                    ),
                    child: const Icon(Icons.person_outline),
                  ),
                ],
              ),
            );
          },
        ),
      ],
      child: widget.child,
    );
  }

  @override
  void dispose() {
    _stopLongPressTimer();
    super.dispose();
  }

  void _handleAppsLongPress() {
    if (!context.mounted) return;
    unawaited(context.read<AppTabCubit>().openWithSearch());
    context.go(Routes.apps);
  }

  Future<void> _onItemTapped(
    int index,
    BuildContext context,
    AppTabState state,
  ) async {
    final isDoubleTap =
        _lastTabIndex == index &&
        _tapStopwatch.isRunning &&
        _tapStopwatch.elapsed < const Duration(milliseconds: 300);

    if (index == 1 && isDoubleTap) {
      await context.read<AppTabCubit>().clearSelection();
      if (context.mounted) context.go(Routes.apps);
      _lastTabIndex = index;
      _tapStopwatch
        ..reset()
        ..start();
      return;
    }

    final appRoute = state.hasSelection
        ? AppRegistry.moduleById(state.selectedId)?.route
        : null;
    final route = switch (index) {
      1 => appRoute ?? Routes.apps,
      2 => Routes.profileRoot,
      _ => Routes.home,
    };
    if (context.mounted) context.go(route);
    await context.read<AppTabCubit>().setLastTabRoute(route);
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

  void _stopLongPressTimer([PointerEvent? _]) {
    _longPressTimer?.cancel();
    _longPressTimer = null;
  }

  static int _calculateSelectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;

    if (location.startsWith(Routes.apps)) return 1;
    if (location.startsWith(Routes.profileRoot)) return 2;
    if (location.startsWith(Routes.settings)) return 2;
    if (AppRegistry.moduleFromLocation(location) != null) return 1;
    return 0; // home
  }
}

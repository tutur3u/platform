part of 'shell_page.dart';

extension _ShellPageInteractions on _ShellPageState {
  Future<void> _onMiniAppItemTapped(
    Key? key,
    BuildContext context,
    AppModule activeModule,
    List<MiniAppNavItem> activeMiniNavItems,
  ) async {
    _debugBack(
      'miniAppNav.tap',
      'key=$key activeModule=${activeModule.id} '
          'current=${_normalizeRouteLocation(widget.matchedLocation)}',
    );
    if (key == _ShellPageState._backToRootKey) {
      await _openAppsDrawerFromAppsTab();
      return;
    }

    if (activeMiniNavItems.isEmpty) {
      return;
    }

    final selected = activeMiniNavItems.firstWhere(
      (item) => _miniNavKey(activeModule.id, item.id) == key,
      orElse: () => activeMiniNavItems.first,
    );

    if (!context.mounted) {
      return;
    }

    final currentRoute = _normalizeRouteLocation(widget.matchedLocation);
    final selectedRoute = _normalizeRouteLocation(selected.route);
    if (currentRoute == selectedRoute) {
      return;
    }

    final isMiniAppRoot =
        selectedRoute == _normalizeRouteLocation(activeModule.route);
    _debugBack(
      isMiniAppRoot ? 'miniAppNav.go' : 'miniAppNav.goChild',
      selectedRoute,
    );
    context.go(selectedRoute);

    await context.read<AppTabCubit>().setLastTabRoute(selected.route);

    if (_activeLayerPage == 0) {
      await _setActiveLayerPage(1);
    }
  }

  void _onNavBarHorizontalDragEnd(DragEndDetails details) {
    final velocity = details.primaryVelocity ?? 0;
    if (velocity > 250) {
      _setShellState(() => _showMiniNav = false);
      return;
    }
    if (velocity < -250) {
      _setShellState(() => _showMiniNav = true);
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
        _setShellState(() {
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
        _setShellState(() {
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
    _debugBack('rootNav.longPressApps');
    unawaited(context.read<AppTabCubit>().openWithSearch());
    context.go(Routes.apps);
  }

  Future<void> _openAppsDrawerFromAppsTab() async {
    final currentContext = context;
    final appTabCubit = currentContext.read<AppTabCubit>();
    _debugBack('rootNav.openAppsDrawer');
    _suppressPointerEventsDuringTransition();
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

  Future<void> _onItemTapped(int index, BuildContext context) async {
    final appTabCubit = context.read<AppTabCubit>();
    final isDoubleTap =
        _lastTabIndex == index &&
        _tapStopwatch.isRunning &&
        _tapStopwatch.elapsed < const Duration(milliseconds: 300);

    if (index == 2 && isDoubleTap) {
      await _openAppsDrawerFromAppsTab();
      return;
    }

    final route = switch (index) {
      2 => Routes.apps,
      1 => Routes.assistant,
      _ => Routes.home,
    };
    _debugBack(
      'rootNav.tap',
      'index=$index route=$route selectedApp=${appTabCubit.state.selectedId}',
    );
    if (route == Routes.apps) {
      _suppressPointerEventsDuringTransition();
    }
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
        _ShellPageState._calculateSelectedIndex(widget.matchedLocation) == 2;
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
}

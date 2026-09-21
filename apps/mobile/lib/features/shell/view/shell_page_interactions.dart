part of 'shell_page.dart';

extension _ShellPageInteractions on _ShellPageState {
  void _onInjectedMiniNavItemTapped(
    Key? key,
    ShellMiniNavRegistration? registration,
  ) {
    if (registration == null) {
      return;
    }

    ShellMiniNavItemSpec? selected;
    for (final item in registration.items) {
      if (_injectedMiniNavKey(registration.ownerId, item.id) == key) {
        selected = item;
        break;
      }
    }
    if (selected == null) {
      return;
    }

    if (!selected.enabled) {
      return;
    }

    if (selected.id == 'back' &&
        registration.deepLinkBackRoute == Routes.apps) {
      unawaited(_returnToAppOrigin());
      return;
    }
    selected.onPressed?.call();
  }

  Future<void> _onMiniAppItemTapped(
    Key? key,
    BuildContext context,
    AppModule? activeModule,
    List<MiniAppNavItem> activeMiniNavItems,
  ) async {
    if (activeModule == null) {
      return;
    }
    _debugBack(
      'miniAppNav.tap',
      'key=$key activeModule=${activeModule.id} '
          'current=${_normalizeRouteLocation(widget.matchedLocation)}',
    );
    if (key == _ShellPageState._backToRootKey) {
      await _returnToAppOrigin();
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
    unawaited(showAppsPicker(context, searchInitially: true));
  }

  Future<void> _returnToAppOrigin() async {
    final tabs = context.read<AppTabCubit>();
    final origin = tabs.state.appOrigin;
    await tabs.clearSelection();
    await tabs.setLastTabRoute(origin);
    if (mounted) context.go(origin);
  }

  Future<void> _openAppsDrawerFromAppsTab() => showAppsPicker(context);

  Future<void> _onItemTapped(int index, BuildContext context) async {
    final appTabCubit = context.read<AppTabCubit>();
    if (index == 2) {
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
    _tapStopwatch
      ..reset()
      ..start();
  }

  void _startLongPressTimer(PointerDownEvent event, BuildContext navContext) {
    if (!_isAppsTabHit(event, navContext)) return;
    _stopLongPressTimer();
    _longPressTimer = Timer(
      const Duration(milliseconds: 500),
      _handleAppsLongPress,
    );
  }

  void _handlePointerUp(PointerUpEvent event, BuildContext navContext) {
    _stopLongPressTimer();
    if (!_isAppsTabHit(event, navContext)) {
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

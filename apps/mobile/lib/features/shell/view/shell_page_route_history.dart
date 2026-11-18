part of 'shell_page.dart';

/// Back history, and how route changes feed the push/pop timeline.
extension _ShellPageRouteHistory on _ShellPageState {
  /// The floating shell (header, body and dock) inside the route
  /// transition scope, so the routes and the chrome share one timeline.
  Widget _buildBodyWithFloatingNav({
    required Widget body,
    required Widget navigationBar,
    Widget? header,
    double bodyBottomInset = 0,
    double navigationBottomOffset = 0,
    bool composerVisible = false,
    double navigationWidth = 264,
    bool allowDockSlot = true,
    bool hideIdleNavigation = false,
    bool fixedZones = false,
    Widget? dockLeading,
  }) {
    return ShellDockScope(
      controller: _dockSlotController,
      child: _withRouteTransitions(
        FloatingShellDock(
          location: widget.matchedLocation,
          navigationWidth: navigationWidth,
          allowDockSlot: allowDockSlot,
          hideIdleNavigation: hideIdleNavigation,
          fixedZones: fixedZones,
          leading: dockLeading,
          keyboardVisible: MediaQuery.viewInsetsOf(context).bottom > 0,
          bottomInset: bodyBottomInset,
          navigationBottomOffset: navigationBottomOffset,
          reserveNavigationClearance: !composerVisible,
          reclaimNavigationClearanceWhenHidden:
              widget.matchedLocation == Routes.profileRoot ||
              widget.matchedLocation == Routes.home ||
              widget.matchedLocation == Routes.calendar ||
              (widget.assistantConversationsEnabled &&
                  widget.matchedLocation == Routes.assistant) ||
              widget.matchedLocation == Routes.assistantConversations,
          keepNavigationVisible: composerVisible,
          composerVisible: composerVisible,
          navigation: navigationBar,
          header: header,
          minimumHeaderContentHeight: assistantHeaderContentHeight(
            context,
            location: widget.matchedLocation,
          ),
          scrollableHeader: _isRootTabLocation(widget.matchedLocation),
          child: body,
        ),
      ),
    );
  }

  /// Lets shell routes and chrome share one push/pop timeline.
  Widget _withRouteTransitions(Widget child) => ShellRouteTransitionScope(
    controller: _routeTransitions,
    location: widget.matchedLocation,
    previousLocation: _previousLocation,
    arrivedBack: _arrivedBack,
    animates: _routeAnimates,
    interceptsBack: _routeInterceptsBack,
    hasNotificationsOrigin: () =>
        _notificationsOrigin(_normalizeRouteLocation(widget.matchedLocation)) !=
        null,
    child: child,
  );

  /// Records how the shell reached its location from [oldWidget]'s.
  void _trackRouteChange(ShellPage oldWidget) {
    _previousLocation = oldWidget.matchedLocation;
    _samePattern =
        oldWidget.routePattern != null &&
        oldWidget.routePattern == widget.routePattern;
    // A swipe pops the page being left without the Back handler, so it must
    // not grow the history. A navigation that starts while an earlier pop
    // still animates leaves another page and stays a forward move.
    if (_routeTransitions.poppingFrom(oldWidget.matchedLocation)) {
      _isHandlingBackNavigation = true;
    }
    _arrivedBack = _isHandlingBackNavigation;
  }

  /// Root destinations swap in place, sibling destinations of one mini app
  /// replace each other, and a location change within one route pattern
  /// updates its page in place; every other move is a push or a pop.
  bool _routeAnimates(String from, String to) {
    String normal(String? value) => normalizeShellRouteLocation(value ?? '');
    if (_samePattern &&
        normal(from) == normal(_previousLocation) &&
        normal(to) == normal(widget.matchedLocation)) {
      return false;
    }
    return !_isRootTabLocation(from) &&
        !_isRootTabLocation(to) &&
        !(_isPrimaryMiniAppDestination(from) &&
            _isPrimaryMiniAppDestination(to) &&
            _isSameMiniAppFamily(from, to));
  }

  /// Notifications, when the current page was opened from it. Back returns
  /// there ahead of the page's own list. A shell root (Home, Assistant, Apps,
  /// Notifications, You) keeps its own Back; any other page, a mini app's
  /// sections and an app pinned as a tab included, returns to Notifications.
  /// A cold-start deep link has no such history and keeps its fallback.
  String? _notificationsOrigin(String current) {
    final last = _routeHistory.lastOrNull;
    if (last == null || _isRootTabLocation(current)) return null;
    final origin = _normalizeRouteLocation(last);
    return origin == Routes.notifications ||
            origin == Routes.notificationsArchive
        ? origin
        : null;
  }

  /// Whether Back at the current location runs the shell's own handling (a
  /// page's Back, an open modal, a deep link's Back route, a return to
  /// Notifications) that an edge swipe would skip.
  bool _routeInterceptsBack() {
    if (!mounted) return true;
    final location = _normalizeRouteLocation(widget.matchedLocation);
    return location == Routes.assistantConversations ||
        _hasOpenModal() ||
        context.read<ShellChromeActionsCubit?>()?.state.backForLocation(
              location,
            ) !=
            null ||
        lookupShellMiniNavCubit(
              context,
            )?.state.deepLinkBackRouteForLocation(location) !=
            null ||
        _notificationsOrigin(location) != null;
  }

  void _recordRouteVisit({
    required String oldLocation,
    required String newLocation,
  }) {
    final previous = _normalizeRouteLocation(oldLocation);
    final current = _normalizeRouteLocation(newLocation);

    if (previous == current) {
      _debugBack(
        'recordRouteVisit.skipSameRoute',
        'old=$previous new=$current',
      );
      return;
    }

    _lastExitAttemptAt = null;
    _dismissExitConfirmationToast();

    if (_isHandlingBackNavigation) {
      _debugBack(
        'recordRouteVisit.skipBackHandled',
        'old=$previous new=$current',
      );
      _isHandlingBackNavigation = false;
      return;
    }

    if (!Routes.isSettingsHubLocation(current) &&
        _isPrimaryMiniAppDestination(current) &&
        _isSameMiniAppFamily(previous, current)) {
      // A dock section replaces its sibling. Only detail routes form a
      // drill-down history within a mini app.
      _routeHistory.removeWhere(
        (route) => _isSameMiniAppFamily(route, current),
      );
    } else {
      _routeHistory.add(previous);
    }
    if (_routeHistory.length > 50) {
      _routeHistory.removeAt(0);
    }
    _debugBack('recordRouteVisit.added', 'old=$previous new=$current');
  }

  String? _takePreviousRoute(String currentLocation) {
    while (_routeHistory.isNotEmpty) {
      final previous = _routeHistory.removeLast();
      if (_normalizeRouteLocation(previous) == currentLocation) {
        continue;
      }
      return previous;
    }
    return null;
  }

  bool _isSameMiniAppFamily(String locationA, String locationB) {
    if (Routes.isSettingsHubLocation(locationA) &&
        Routes.isSettingsHubLocation(locationB)) {
      return true;
    }
    final rootA = Routes.miniAppRootForLocation(locationA);
    final rootB = Routes.miniAppRootForLocation(locationB);
    return rootA != null && rootA == rootB;
  }

  bool _isPrimaryMiniAppDestination(String location) {
    final normalized = _normalizeRouteLocation(location);
    return normalized == Routes.taskBoards ||
        AppRegistry.allModules.any(
          (module) => module.miniAppNavItems.any(
            (item) => _normalizeRouteLocation(item.route) == normalized,
          ),
        );
  }

  String? _parentRouteFor(String location, String root) {
    if (Routes.isTaskBoardDetailLocation(location)) return Routes.taskBoards;
    if (Routes.isSettingsHubLocation(location)) {
      final slash = location.lastIndexOf('/');
      if (slash > 0) {
        final parent = location.substring(0, slash);
        return parent;
      }
      return root;
    }
    final module = AppRegistry.moduleFromLocation(location);
    final candidates =
        module?.miniAppNavItems.map((item) => item.route) ??
        const Iterable<String>.empty();
    final parents = candidates.where(
      (route) =>
          route != root && route != location && location.startsWith('$route/'),
    );
    if (parents.isEmpty) return null;
    return parents.reduce((a, b) => a.length >= b.length ? a : b);
  }
}

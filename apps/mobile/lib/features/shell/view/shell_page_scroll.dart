part of 'shell_page.dart';

extension _ShellPageScroll on _ShellPageState {
  /// The shell navigator's leaf page key, which GoRouter derives from the
  /// route's path template.
  ValueKey<String>? _currentPageKey() => GoRouter.maybeOf(
    context,
  )?.routerDelegate.currentConfiguration.lastOrNull?.pageKey;

  /// Two locations of one path template (two boards, two wallets) share a
  /// page key, so the navigator keeps the outgoing page and its scroll
  /// position for the new location. A newly opened location starts at the
  /// top, like a fresh page.
  void _resetReusedPageScroll(String previousLocation) {
    final previousKey = _pageKey;
    _pageKey = _currentPageKey();
    if (previousKey == null ||
        _pageKey != previousKey ||
        _isRootTabLocation(widget.matchedLocation)) {
      return;
    }
    final scrollable =
        _pageScrollables[_normalizeRouteLocation(previousLocation)]?.target;
    if (scrollable == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !scrollable.mounted) return;
      final position = scrollable.position;
      if (position.hasPixels && position.pixels != position.minScrollExtent) {
        position.jumpTo(position.minScrollExtent);
      }
    });
  }

  void _reselectPage(String route) {
    final normalized = _normalizeRouteLocation(route);
    final previous = _lastScrolledDockRoute;
    _lastScrolledDockRoute = null;
    if (previous != normalized && _scrollPageToTop(normalized)) {
      _lastScrolledDockRoute = normalized;
      return;
    }
    // A third tap also works while the second tap's animation is in flight.
    final reset = context
        .read<ShellChromeActionsCubit?>()
        ?.state
        .resetSectionForLocation(normalized);
    if (reset == null) return;
    _scrollPageToTop(normalized, jump: true);
    reset();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted ||
          _normalizeRouteLocation(widget.matchedLocation) != normalized) {
        return;
      }
      scheduleMicrotask(() {
        if (!mounted ||
            _normalizeRouteLocation(widget.matchedLocation) != normalized) {
          return;
        }
        _scrollPageToTop(normalized, jump: true);
      });
    });
  }

  Widget _trackPageScrolling(String route, Widget child) =>
      NotificationListener<ScrollMetricsNotification>(
        onNotification: (notification) => _capturePageScrollable(
          route,
          notification.context,
          notification.metrics,
          notification.depth,
        ),
        child: NotificationListener<ScrollNotification>(
          onNotification: (notification) {
            if ((notification is ScrollStartNotification &&
                    notification.dragDetails != null) ||
                (notification is UserScrollNotification &&
                    notification.direction != ScrollDirection.idle)) {
              _lastScrolledDockRoute = null;
            }
            return _capturePageScrollable(
              route,
              notification.context,
              notification.metrics,
              notification.depth,
            );
          },
          child: child,
        ),
      );

  bool _capturePageScrollable(
    String route,
    BuildContext? scrollContext,
    ScrollMetrics metrics,
    int depth,
  ) {
    if (depth != 0 || metrics.axis != Axis.vertical || scrollContext == null) {
      return false;
    }
    final scrollable = Scrollable.maybeOf(scrollContext);
    if (scrollable != null) {
      _pageScrollables[_normalizeRouteLocation(route)] = WeakReference(
        scrollable,
      );
    }
    return false;
  }

  bool _scrollPageToTop(String route, {bool jump = false}) {
    final scrollable = _pageScrollables[_normalizeRouteLocation(route)]?.target;
    if (scrollable == null || !scrollable.mounted) return false;
    final position = scrollable.position;
    if (!position.hasPixels ||
        position.pixels <= position.minScrollExtent + 1) {
      return false;
    }
    if (jump) {
      position.jumpTo(position.minScrollExtent);
      return true;
    }
    unawaited(
      position.animateTo(
        position.minScrollExtent,
        duration: const Duration(milliseconds: 360),
        curve: Curves.easeOutCubic,
      ),
    );
    return true;
  }
}

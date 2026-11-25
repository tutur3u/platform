import 'package:flutter/widgets.dart';

/// Tracks imperatively pushed pages, such as the Mail composer or a form, that
/// may hold unsaved work.
///
/// Routed destinations are declarative pages; a page pushed on any navigator,
/// root or nested, is not. Application shortcuts consult this guard, rather
/// than the focused widget, before moving the app to another destination, so a
/// draft is protected even when focus sits outside its route.
class DraftRouteGuard {
  DraftRouteGuard._();

  static final instance = DraftRouteGuard._();

  // Weak, so a navigator torn down without popping its routes (an account or
  // workspace remount) never keeps them alive through this process-wide guard.
  final _routes = <WeakReference<Route<dynamic>>>[];

  /// Tracked entries, including any not yet pruned.
  @visibleForTesting
  int get trackedCount => _routes.length;

  void _add(Route<dynamic> route) {
    _prune();
    _routes.add(WeakReference(route));
  }

  void _remove(Route<dynamic>? route) {
    _routes.removeWhere((ref) => ref.target == null || ref.target == route);
    _prune();
  }

  void _prune() => _routes.removeWhere((ref) {
    final route = ref.target;
    // A route outlives its navigator when the navigator is torn down with the
    // route still on its stack, so ownership is checked as well.
    return route == null || !route.isActive || route.navigator?.mounted != true;
  });

  /// One observer per navigator, all reporting to this guard.
  NavigatorObserver toObserver() {
    return _DraftRouteObserver(this);
  }

  /// Whether a pushed page is currently open above the first route of its
  /// navigator. Popup routes, including the command palette, are never counted.
  bool get hasBlockingRoute {
    _prune();
    return _routes.any((ref) => ref.target?.isFirst == false);
  }

  static bool _tracks(Route<dynamic>? route) =>
      route is PageRoute<dynamic> && route.settings is! Page<dynamic>;
}

class _DraftRouteObserver extends NavigatorObserver {
  _DraftRouteObserver(this._guard);

  final DraftRouteGuard _guard;

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    // A navigator's first route is never a pushed page above something else.
    if (previousRoute != null && DraftRouteGuard._tracks(route)) {
      _guard._add(route);
    }
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    _guard._remove(oldRoute);
    if (DraftRouteGuard._tracks(newRoute)) _guard._add(newRoute!);
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _guard._remove(route);

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _guard._remove(route);
}

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

  final _routes = <Route<dynamic>>{};

  /// One observer per navigator, all reporting to this guard.
  NavigatorObserver toObserver() {
    return _DraftRouteObserver(this);
  }

  /// Whether a pushed page is currently open above the first route of its
  /// navigator. Popup routes, including the command palette, are never counted.
  bool get hasBlockingRoute {
    _routes.removeWhere((route) => !route.isActive);
    return _routes.any((route) => !route.isFirst);
  }

  static bool _tracks(Route<dynamic>? route) =>
      route is PageRoute<dynamic> && route.settings is! Page<dynamic>;
}

class _DraftRouteObserver extends NavigatorObserver {
  _DraftRouteObserver(this._guard);

  final DraftRouteGuard _guard;

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (DraftRouteGuard._tracks(route)) _guard._routes.add(route);
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    if (oldRoute != null) _guard._routes.remove(oldRoute);
    if (DraftRouteGuard._tracks(newRoute)) _guard._routes.add(newRoute!);
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _guard._routes.remove(route);

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _guard._routes.remove(route);
}

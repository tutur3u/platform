import 'package:go_router/go_router.dart';

extension GoRouterMatchedLocation on GoRouter {
  /// The deepest matched route location, or the URI path when nothing has
  /// matched yet.
  String get currentMatchedLocation {
    final configuration = routerDelegate.currentConfiguration;
    if (configuration.matches.isEmpty) {
      return configuration.uri.path;
    }
    return configuration.matches.last.matchedLocation;
  }
}

import 'dart:async';

import 'package:flutter/foundation.dart';

/// Notifies `GoRouter` when any auth, workspace or app-access state changes
/// so it re-evaluates redirects.
class AppRouterRefreshNotifier extends ChangeNotifier {
  AppRouterRefreshNotifier(Iterable<Stream<Object?>> streams)
    : _subscriptions = [for (final stream in streams) stream.listen((_) {})] {
    for (final subscription in _subscriptions) {
      subscription.onData((_) => notifyListeners());
    }
  }

  final List<StreamSubscription<Object?>> _subscriptions;

  @override
  void dispose() {
    for (final subscription in _subscriptions) {
      unawaited(subscription.cancel());
    }
    super.dispose();
  }
}

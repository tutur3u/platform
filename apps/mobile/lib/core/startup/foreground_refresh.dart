import 'dart:ui';

typedef ForegroundRefreshHandler =
    void Function(Object owner, VoidCallback work);

/// Delivers feature-owned foreground work through the app's privacy gate.
abstract final class ForegroundRefresh {
  static ForegroundRefreshHandler? _handler;

  static VoidCallback bind(ForegroundRefreshHandler handler) {
    _handler = handler;
    return () {
      if (identical(_handler, handler)) _handler = null;
    };
  }

  static void request(Object owner, VoidCallback work) {
    final handler = _handler;
    if (handler == null) {
      work();
    } else {
      handler(owner, work);
    }
  }
}

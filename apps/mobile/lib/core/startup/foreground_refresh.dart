import 'dart:async';
import 'dart:ui';

typedef ForegroundRefreshHandler =
    void Function(Object owner, VoidCallback work);

/// Delivers feature-owned foreground work through the app's privacy gate.
abstract final class ForegroundRefresh {
  static ForegroundRefreshHandler? _handler;
  static final _pending = <Object, VoidCallback>{};

  static VoidCallback bind(ForegroundRefreshHandler handler) {
    _cancelPending();
    _handler = handler;
    return () {
      if (!identical(_handler, handler)) return;
      _handler = null;
      _cancelPending();
    };
  }

  static void _cancelPending() {
    for (final cancel in _pending.values) {
      cancel();
    }
    _pending.clear();
  }

  /// Waits for admission. A detached gate cancels work it has not started.
  static Future<T?> run<T>(Future<T> Function() work) {
    final owner = Object();
    final zone = Zone.current;
    final result = Completer<T?>();
    _pending[owner] = () => result.complete(null);
    request(owner, () {
      if (_pending.remove(owner) != null) {
        result.complete(zone.run(() => Future<T>.sync(work)));
      }
    });
    return result.future;
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

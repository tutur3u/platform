import 'dart:async';

/// A timed-out plugin keeps its slot until its late work and cleanup settle.
/// New windows stay fenced while the API request can finish.
class IntegrityBrowserLifecycle {
  bool _busy = false;

  Future<String> run<T extends Object>({
    required Future<T> Function() create,
    required Future<String> Function(T browser, bool Function() active) use,
    required Future<void> Function(T browser) close,
    Duration deadline = const Duration(seconds: 22),
  }) async {
    if (_busy) throw StateError('Integrity browser is still retiring');
    _busy = true;
    T? browser;
    var retired = false;
    var settled = false;
    Future<void>? closing;

    void cleanup() {
      final owned = browser;
      if (owned == null || closing != null) return;
      final pending = Future<void>.sync(() => close(owned));
      closing = pending;
      // Retain both completion paths. Timeout never drops ownership of late
      // creation, run or disposal, and errors never become uncaught futures.
      unawaited(
        pending.then<void>(
          (_) {
            closing = null;
            if (settled) _busy = false;
          },
          onError: (Object _, StackTrace _) {
            // Unknown disposal outcome keeps the browser fence closed.
          },
        ),
      );
    }

    final operation = Future<String>(() async {
      browser = await create();
      if (retired) throw TimeoutException('Integrity browser retired');
      return await use(browser!, () => !retired);
    });
    unawaited(
      operation.then<void>(
        (_) {
          settled = true;
          if (retired) cleanup();
        },
        onError: (Object _, StackTrace _) {
          settled = true;
          if (browser == null) _busy = false;
          if (retired) cleanup();
        },
      ),
    );
    try {
      return await operation.timeout(deadline);
    } finally {
      retired = true;
      cleanup();
    }
  }
}

/// Enforces request-start spacing with a monotonic clock.
/// Early timer wakeups are rechecked before dispatch.
class OfflineApiPacer {
  OfflineApiPacer({
    Duration Function()? elapsed,
    Future<void> Function(Duration)? delay,
  }) : _elapsed = elapsed ?? _monotonicClock(),
       _delay = delay ?? Future<void>.delayed;

  static Duration Function() _monotonicClock() {
    final stopwatch = Stopwatch()..start();
    return () => stopwatch.elapsed;
  }

  final Duration Function() _elapsed;
  final Future<void> Function(Duration) _delay;
  Duration? _lastStarted;

  Future<T> run<T>(Future<T> Function() request) async {
    final lastStarted = _lastStarted;
    if (lastStarted != null) {
      var remaining =
          const Duration(milliseconds: 750) - (_elapsed() - lastStarted);
      while (remaining > Duration.zero) {
        await _delay(remaining);
        remaining =
            const Duration(milliseconds: 750) - (_elapsed() - lastStarted);
      }
    }
    _lastStarted = _elapsed();
    return await request();
  }
}

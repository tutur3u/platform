/// Public startup phases contain durations only, never connection credentials.
enum AssistantLiveStartupPhase { token, history, audio, socket, ready, total }

class AssistantLiveStartupTimings {
  final Stopwatch _total = Stopwatch()..start();
  final Map<AssistantLiveStartupPhase, int> _milliseconds = {};

  Future<T> measure<T>(
    AssistantLiveStartupPhase phase,
    Future<T> Function() operation,
  ) async {
    final stopwatch = Stopwatch()..start();
    try {
      return await operation();
    } finally {
      stopwatch.stop();
      _milliseconds[phase] = stopwatch.elapsedMilliseconds;
    }
  }

  void finish() {
    _total.stop();
    _milliseconds[AssistantLiveStartupPhase.total] = _total.elapsedMilliseconds;
  }

  Map<AssistantLiveStartupPhase, int> get snapshot =>
      Map.unmodifiable(_milliseconds);
}

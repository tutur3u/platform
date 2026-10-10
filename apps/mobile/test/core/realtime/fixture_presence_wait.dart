import 'dart:async';

/// Local socket closure does not acknowledge the web peer's presence frame.
Future<Map<String, dynamic>> waitForNativeDeparture(
  Future<Map<String, dynamic>> Function() readObserved,
  String nativeId, {
  Duration timeout = const Duration(seconds: 2),
  Duration pollInterval = const Duration(milliseconds: 20),
}) async {
  if (timeout <= Duration.zero || pollInterval <= Duration.zero) {
    throw ArgumentError('Departure timing bounds must be positive');
  }
  final elapsed = Stopwatch()..start();
  TimeoutException expired() => TimeoutException(
    'Native presence did not depart within $timeout',
    timeout,
  );
  while (true) {
    final remaining = timeout - elapsed.elapsed;
    if (remaining <= Duration.zero) throw expired();
    final observed = await readObserved().timeout(
      remaining,
      onTimeout: () => throw expired(),
    );
    final presence = observed['presence'] as Map<String, dynamic>;
    if (presence[nativeId] == null) return observed;
    final pause = timeout - elapsed.elapsed;
    if (pause <= Duration.zero) throw expired();
    await Future<void>.delayed(pause < pollInterval ? pause : pollInterval);
  }
}

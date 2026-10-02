import 'dart:async';

/// Marks an explicit or silent preparation without sharing CAPTCHA tokens.
/// All instances share one pacing lane; foreground requests remain independent.
class OfflineApiRequest {
  static final Object _bulkKey = Object();
  static final Object _paceKey = Object();
  static final Object _challengeKey = Object();
  static final Object _continueKey = Object();
  static Future<void> _lane = Future<void>.value();
  static DateTime? _lastStarted;

  static bool get active => Zone.current[_bulkKey] == true;
  static bool get allowsChallenge => Zone.current[_challengeKey] != false;

  static Future<T> run<T>(
    Future<T> Function() operation, {
    bool allowChallenge = true,
    bool markBulk = true,
    bool Function()? shouldContinue,
  }) => runZoned(
    operation,
    zoneValues: {
      _bulkKey: markBulk,
      _paceKey: true,
      _challengeKey: allowChallenge,
      _continueKey: shouldContinue,
    },
  );

  static void _checkScope() {
    final shouldContinue = Zone.current[_continueKey] as bool Function()?;
    if (shouldContinue != null && !shouldContinue()) {
      throw StateError('Offline preparation scope changed');
    }
  }

  static Future<T> paced<T>(Future<T> Function() request) {
    if (Zone.current[_paceKey] != true) return request();
    final completion = Completer<T>();
    _lane = _lane.then((_) async {
      try {
        _checkScope();
        final lastStarted = _lastStarted;
        if (lastStarted != null) {
          final remaining =
              const Duration(milliseconds: 750) -
              DateTime.now().difference(lastStarted);
          if (remaining > Duration.zero) await Future<void>.delayed(remaining);
        }
        _lastStarted = DateTime.now();
        _checkScope();
        final result = await request();
        _checkScope();
        completion.complete(result);
      } on Object catch (error, stackTrace) {
        completion.completeError(error, stackTrace);
      }
    });
    return completion.future;
  }
}

import 'dart:async';

import 'package:mobile/data/sources/offline_api_pacer.dart';

/// Marks an explicit or silent preparation without sharing CAPTCHA tokens.
/// All instances share one pacing lane; foreground requests remain independent.
class OfflineApiRequest {
  static final Object _bulkKey = Object();
  static final Object _paceKey = Object();
  static final Object _challengeKey = Object();
  static final Object _continueKey = Object();
  static Future<void> _lane = Future<void>.value();
  static final _pacer = OfflineApiPacer();

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

  static Future<T> paced<T>(
    Future<T> Function() request, {
    Future<void> Function()? prepare,
  }) {
    if (Zone.current[_paceKey] != true) {
      return () async {
        if (prepare != null) await prepare();
        return await request();
      }();
    }
    final completion = Completer<T>();
    _lane = _lane.then((_) async {
      try {
        _checkScope();
        if (prepare != null) await prepare();
        _checkScope();
        final result = await _pacer.run(() {
          _checkScope();
          return request();
        });
        _checkScope();
        completion.complete(result);
      } on Object catch (error, stackTrace) {
        completion.completeError(error, stackTrace);
      }
    });
    return completion.future;
  }
}

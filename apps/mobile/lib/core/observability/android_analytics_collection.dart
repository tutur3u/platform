import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/services.dart';

/// Starts the deferred FlutterFire plugin only after native consent admission.
class AndroidAnalyticsCollection {
  AndroidAnalyticsCollection({
    required Future<bool> Function({required bool enabled}) configureNative,
    required FirebaseAnalytics Function() analytics,
  }) : _configureNative = configureNative,
       _createAnalytics = analytics;

  static final instance = AndroidAnalyticsCollection(
    configureNative: ({required enabled}) async =>
        await const MethodChannel(
          'mobile/firebase_startup',
        ).invokeMethod<bool>('prepareAnalyticsCollection', enabled) ??
        false,
    analytics: () => FirebaseAnalytics.instance,
  );

  final Future<bool> Function({required bool enabled}) _configureNative;
  final FirebaseAnalytics Function() _createAnalytics;
  FirebaseAnalytics? _analytics;
  Future<void> _pending = Future<void>.value();
  int _epoch = 0;
  bool _appOpenAttempted = false;

  Future<void> apply({required bool enabled}) {
    final epoch = ++_epoch;
    final operation = _pending.then(
      (_) => _apply(enabled: enabled, epoch: epoch),
      onError: (Object _, StackTrace _) =>
          _apply(enabled: enabled, epoch: epoch),
    );
    _pending = operation;
    return operation;
  }

  Future<void> _apply({required bool enabled, required int epoch}) async {
    if (epoch != _epoch) return;
    if (!enabled) {
      await _disable();
      return;
    }

    final admitted = await _configureNative(enabled: true);
    if (epoch != _epoch) return;
    if (!admitted) {
      await _disable();
      return;
    }

    try {
      final analytics = _analytics ??= _createAnalytics();
      await analytics.setAnalyticsCollectionEnabled(true);
      if (epoch != _epoch || _appOpenAttempted) return;
      // The process singleton retains this guard across consent/session changes,
      // including a failed dispatch, so retries cannot duplicate the event.
      _appOpenAttempted = true;
      // Startup while disabled can suppress automatic launch events. Dispatch
      // through the admitted plugin to activate its normal event/upload path.
      await analytics.logAppOpen();
    } on Object {
      await _disable();
      rethrow;
    }
  }

  Future<void> _disable() async {
    try {
      await _analytics?.setAnalyticsCollectionEnabled(false);
    } finally {
      await _configureNative(enabled: false);
    }
  }
}

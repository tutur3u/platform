import 'dart:developer';

import 'package:shared_preferences/shared_preferences.dart';

/// One serialized admission path for both native platforms and FID cleanup.
class FirebaseAdmission {
  FirebaseAdmission({
    required Future<bool> Function({
      required bool signedIn,
      required bool pushAllowed,
      required bool telemetryAllowed,
    })
    initialize,
    required Future<void> Function({required bool enabled}) telemetry,
    required Future<void> Function() unregisterPush,
    required Future<void> Function() deleteInstallation,
  }) : _initialize = initialize,
       _telemetry = telemetry,
       _unregisterPush = unregisterPush,
       _deleteInstallation = deleteInstallation;

  final Future<bool> Function({
    required bool signedIn,
    required bool pushAllowed,
    required bool telemetryAllowed,
  })
  _initialize;
  final Future<void> Function({required bool enabled}) _telemetry;
  final Future<void> Function() _unregisterPush;
  final Future<void> Function() _deleteInstallation;
  Future<void> _pending = Future<void>.value();
  bool _initialized = false;
  bool _mayHaveInstallation = false;

  static const deletionStateKey = 'firebase-installation-deletion-state-v1';

  Future<void> _persistDeletionState(String state) async {
    final prefs = await SharedPreferences.getInstance();
    if (!await prefs.setString(deletionStateKey, state)) {
      throw StateError('Cannot persist Firebase Installation deletion state');
    }
  }

  int _epoch = 0;

  Future<bool> update({
    required bool signedIn,
    required bool pushAllowed,
    required bool telemetryAllowed,
  }) {
    final epoch = ++_epoch;
    Future<bool> run() async {
      if (epoch != _epoch) return false;
      final admitted = signedIn && (pushAllowed || telemetryAllowed);
      if (!admitted) {
        await _revoke(epoch);
        return false;
      }

      // A new admission opens a new cleanup budget, before any SDK can create
      // an FID. Re-applying the same admission does not reopen that budget.
      if (!_mayHaveInstallation) await _persistDeletionState('active');
      final ready = await _initialize(
        signedIn: signedIn,
        pushAllowed: pushAllowed,
        telemetryAllowed: telemetryAllowed,
      );
      if (ready) {
        _initialized = true;
        _mayHaveInstallation = true;
      }
      if (epoch != _epoch) return false;
      if (!ready) {
        await _revoke(epoch);
        return false;
      }
      await _telemetry(enabled: telemetryAllowed);
      return epoch == _epoch;
    }

    final operation = _pending.then(
      (_) => run(),
      onError: (Object _, StackTrace _) => run(),
    );
    _pending = operation.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    return operation;
  }

  Future<void> _revoke(int epoch) async {
    if (_initialized && _mayHaveInstallation) {
      await _telemetry(enabled: false);
      if (epoch != _epoch) return;
      try {
        await _unregisterPush();
      } on Object catch (error) {
        log('Push cleanup failed; FID deletion skipped: ${error.runtimeType}');
        return;
      }
      if (epoch != _epoch) return;
      if (_mayHaveInstallation) {
        try {
          final prefs = await SharedPreferences.getInstance();
          final state = prefs.getString(deletionStateKey);
          if (state == 'attempted' || state == 'deleted') {
            _mayHaveInstallation = false;
            return;
          }
          // A durable claim precedes the SDK, including crash/failure cases.
          await _persistDeletionState('attempted');
        } on Object catch (error) {
          _mayHaveInstallation = false;
          log(
            'FID deletion claim failed; request skipped: ${error.runtimeType}',
          );
          return;
        }
        _mayHaveInstallation = false;
        log('Firebase Installation deletion attempted');
        try {
          await _deleteInstallation();
          log('Firebase Installation deletion completed');
          try {
            await _persistDeletionState('deleted');
          } on Object catch (error) {
            log('FID deleted; attempted marker retained: ${error.runtimeType}');
          }
        } on Object catch (error) {
          log('Firebase Installation deletion failed: ${error.runtimeType}');
        }
      }
    }
  }
}

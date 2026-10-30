import 'dart:developer';

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
    if (_initialized) {
      await _telemetry(enabled: false);
      if (epoch != _epoch) return;
      try {
        await _unregisterPush();
      } on Object catch (error) {
        log('Push cleanup failed before FID deletion: ${error.runtimeType}');
      }
      if (epoch != _epoch) return;
      if (_mayHaveInstallation) {
        try {
          await _deleteInstallation();
          _mayHaveInstallation = false;
          log('Firebase Installation deletion completed');
        } on Object catch (error) {
          log('Firebase Installation deletion failed: ${error.runtimeType}');
        }
      }
    }
  }
}

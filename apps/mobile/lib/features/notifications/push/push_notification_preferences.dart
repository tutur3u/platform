part of 'push_notification_service.dart';

extension PushNotificationPreferences on PushNotificationService {
  set firebaseInitializer(
    Future<bool> Function({required bool pushAllowed}) initialize,
  ) {
    _initializeFirebase = initialize;
  }

  Future<void> disableTelemetry() async {
    _sessionClosing = true;
    _sessionEpoch++;
    _pushAdmitted = false;
    if (_initializeFirebase != null) {
      await _initializeFirebase!(pushAllowed: false);
      return;
    }
    if (!_firebaseReady || _appFlavor == null) return;
    await MobileObservability.instance.initialize(
      _appFlavor!,
      collectionEnabled: false,
    );
  }

  Future<void> refreshRegistration() => _syncRegistrationIfAuthorized();

  Future<bool> get pushEnabled async =>
      (await SharedPreferences.getInstance()).getBool('push-enabled') ?? true;

  Future<void> setPushEnabled({required bool enabled}) async {
    _pushEnabled = enabled;
    await (await SharedPreferences.getInstance()).setBool(
      'push-enabled',
      enabled,
    );
    if (enabled) {
      await ensurePermissionPrompted();
    } else {
      _pushAdmitted = false;
      try {
        await prepareInstallationDeletion(strict: true);
      } finally {
        await _initializeFirebaseForSession();
      }
    }
  }

  /// Drains token/server writes before best-effort Installation deletion.
  Future<void> prepareInstallationDeletion({bool strict = false}) async {
    try {
      await _tokenEnrollment;
    } on Object {
      // Finish cleanup even when the in-flight token fetch failed.
    }
    if (_pushCleanupComplete) return;
    try {
      await _revokeTokenCreation(
        force: strict || _messagingInitialized,
        strict: strict,
      );
    } finally {
      await _unregisterDevice();
    }
    _pushCleanupComplete = !_tokenDeletionPending;
  }

  Future<void> _unregisterDevice() async {
    if (_appFlavor == null) return;
    try {
      await _registration;
    } on Exception {
      // A failed registration can still leave an older server row.
    }
    final deviceId = await _getDeviceId();
    if (deviceId == null || _appFlavor == null) return;
    await _repository.unregisterDevice(
      deviceId: deviceId,
      appFlavor: _appFlavor!.value,
    );
  }
}

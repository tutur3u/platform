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

  Future<void> _registerDeviceToken(String token) async {
    final epoch = _sessionEpoch;
    final userId = _currentUserId;
    final appFlavor = _appFlavor;
    if (userId == null || appFlavor == null || _isDisposed) {
      return;
    }

    final deviceId = await _getDeviceId();
    if (deviceId == null || !_currentSession(epoch, userId) || !_pushEnabled) {
      return;
    }

    final previous = _registration;
    final registration = () async {
      try {
        await previous;
      } on Exception {
        /* Retry the next write. */
      }
      if (!_currentSession(epoch, userId) || !_pushEnabled) return;
      final last = _lastRegistration;
      if (last != null &&
          last.flavor == appFlavor &&
          last.deviceId == deviceId &&
          last.token == token &&
          last.age.elapsed < const Duration(minutes: 5)) {
        return;
      }
      try {
        await _repository.registerDevice(
          deviceId: deviceId,
          token: token,
          platform: Platform.isIOS ? 'ios' : 'android',
          appFlavor: appFlavor.value,
        );
      } on Exception {
        // A late POST could overwrite the next token after a timeout.
        _lastRegistration = null;
        _registrationOutcomeUncertain = true;
        rethrow;
      }
      if (!_currentSession(epoch, userId) || !_pushEnabled) return;
      _pushCleanupComplete = false;
      if (_registrationOutcomeUncertain) return;
      _lastRegistration = (
        flavor: appFlavor,
        deviceId: deviceId,
        token: token,
        age: Stopwatch()..start(),
      );
    }();
    _registration = registration;
    await registration;
  }

  Future<void> _unregisterDevice() async {
    final appFlavor = _appFlavor;
    if (appFlavor == null) return;
    final previous = _registration;
    final unregistration = () async {
      try {
        await previous;
      } on Exception {
        // A failed registration can still leave an older server row.
      }
      _lastRegistration = null;
      final deviceId = await _getDeviceId();
      if (deviceId == null) return;
      try {
        await _repository.unregisterDevice(
          deviceId: deviceId,
          appFlavor: appFlavor.value,
        );
      } on Exception {
        // A timed-out DELETE can still finish after the next POST. Keep
        // refreshing the registration for the rest of this process.
        _registrationOutcomeUncertain = true;
        rethrow;
      }
    }();
    // Keep a registration triggered by restored permission behind the DELETE.
    _registration = unregistration;
    await unregistration;
  }
}

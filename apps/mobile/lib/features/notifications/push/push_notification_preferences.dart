part of 'push_notification_service.dart';

extension PushNotificationPreferences on PushNotificationService {
  set firebaseInitializer(Future<void> Function() initialize) {
    _initializeFirebase = initialize;
  }

  Future<void> disableTelemetry() async {
    if (!_firebaseReady || _appFlavor == null) return;
    await MobileObservability.instance.initialize(
      _appFlavor!,
      collectionEnabled: false,
    );
    if (Platform.isAndroid || Platform.isIOS) {
      await const MethodChannel(
        'mobile/firebase_startup',
      ).invokeMethod<void>('endSession');
    }
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
    if (!_firebaseReady && _initializeFirebase != null) return;
    if (enabled) {
      await ensurePermissionPrompted();
    } else {
      try {
        await _revokeTokenCreation(force: true, strict: true);
      } finally {
        await _unregisterDevice();
      }
    }
  }

  Future<void> _unregisterDevice() async {
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

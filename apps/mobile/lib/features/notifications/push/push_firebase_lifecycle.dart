part of 'push_notification_service.dart';

extension PushFirebaseLifecycle on PushNotificationService {
  Future<bool> _initializeFirebaseForSession() async {
    final initialize = _initializeFirebase;
    if (initialize == null) return true;
    final ready = await initialize(pushAllowed: _pushAdmitted);
    _firebaseReady = _firebaseReady || ready;
    if (ready && _pushAdmitted) {
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    }
    return ready;
  }

  Future<bool> _permissionGranted() async {
    if (_messagingOverride != null) {
      return _isAuthorized(await _messaging.getNotificationSettings());
    }
    if (_registrationToken != null) return true;
    return await const MethodChannel(
          'mobile/firebase_startup',
        ).invokeMethod<bool>('pushPermission') ??
        false;
  }

  Future<bool> _requestPermission() async {
    if (_messagingOverride != null) {
      return _isAuthorized(await _messaging.requestPermission());
    }
    if (Platform.isIOS) {
      return await _localNotifications
              .resolvePlatformSpecificImplementation<
                IOSFlutterLocalNotificationsPlugin
              >()
              ?.requestPermissions(alert: true, badge: true, sound: true) ??
          false;
    }
    return await _localNotifications
            .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin
            >()
            ?.requestNotificationsPermission() ??
        false;
  }

  Future<void> _ensureMessagingInitialized() async {
    if (_messagingInitialized || !_pushAdmitted) return;
    if (_initializeFirebase != null && !_firebaseReady) return;

    final pending = _messagingInitialization;
    if (pending != null) {
      await pending;
      return;
    }
    final initialization = _initializeMessaging();
    _messagingInitialization = initialization;
    try {
      await initialization;
    } finally {
      _messagingInitialization = null;
    }
  }

  Future<void> _initializeMessaging() async {
    try {
      _messageSubscription =
          (_foregroundMessages ?? FirebaseMessaging.onMessage).listen((
            message,
          ) {
            unawaited(_handleForegroundMessage(message));
          });
      _messageOpenedSubscription = FirebaseMessaging.onMessageOpenedApp.listen((
        message,
      ) {
        unawaited(_handleRemoteMessageOpened(message));
      });
      _tokenRefreshSubscription = _messaging.onTokenRefresh.listen((token) {
        unawaited(_registerRefreshedToken(token));
      });

      final initialMessage = await _messaging.getInitialMessage();
      if (_isDisposed) return;
      if (initialMessage != null) {
        unawaited(_handleRemoteMessageOpened(initialMessage));
      }
    } catch (_) {
      await _messageSubscription?.cancel();
      await _messageOpenedSubscription?.cancel();
      await _tokenRefreshSubscription?.cancel();
      rethrow;
    }

    _messagingInitialized = true;
  }

  Future<void> _enrollPush(int epoch, String userId) async {
    final previous = _tokenEnrollment;
    final enrollment = () async {
      try {
        await previous;
      } on Object {
        // A failed earlier enrollment still needs cleanup and may be retried.
      }
      if (!_currentSession(epoch, userId) || !_pushAdmitted || !_pushEnabled) {
        return;
      }
      await _ensureMessagingInitialized();
      if (!_currentSession(epoch, userId) || !_pushAdmitted || !_pushEnabled) {
        return;
      }
      _pushCleanupComplete = false;
      await _messaging.setAutoInitEnabled(true);
      if (!_currentSession(epoch, userId)) {
        if (_currentUserId == null || !_pushEnabled) {
          await _revokeTokenCreation(force: true);
        }
        return;
      }
      // Token refresh completes enrollment when APNs answers asynchronously.
      if (Platform.isIOS && await _messaging.getAPNSToken() == null) return;
      if (!_currentSession(epoch, userId) || !_pushEnabled) return;
      final token = await _messaging.getToken();
      if (token == null || token.isEmpty || !_currentSession(epoch, userId)) {
        return;
      }

      await _registerDeviceToken(token);
    }();
    _tokenEnrollment = enrollment;
    await enrollment;
  }
}

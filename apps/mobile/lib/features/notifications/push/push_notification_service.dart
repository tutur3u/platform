import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/observability/mobile_observability.dart';
import 'package:mobile/core/utils/device_info.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/core/utils/timezone_location.dart';
import 'package:mobile/data/repositories/notification_push_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/notifications/push/delivered_inbox_notifications.dart';
import 'package:mobile/features/notifications/push/inbox_push_identity.dart';
import 'package:mobile/features/notifications/push/login_notification_actions.dart';
import 'package:mobile/features/notifications/push/push_background_handler.dart';
import 'package:mobile/features/notifications/push/push_navigation_request.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/timezone.dart' as timezone;

export 'package:mobile/features/notifications/push/push_navigation_request.dart';

part 'push_notification_preferences.dart';

enum PushNotificationEventType { received, opened, archived }

const _pushNotificationChannelId = 'tuturuuu_notifications';
const _pushNotificationChannelName = 'Notifications';
const _pushNotificationChannelDescription =
    'Push notifications for the Tuturuuu inbox';
const _androidNotificationIcon = 'ic_notification';

class PushNotificationEvent {
  const PushNotificationEvent({required this.type, required this.request});

  final PushNotificationEventType type;
  final PushNavigationRequest request;
}

typedef PushNavigationHandler =
    Future<void> Function(PushNavigationRequest request);

class PushNotificationService {
  PushNotificationService({
    Stream<RemoteMessage>? foregroundMessages,
    FirebaseMessaging? messaging,
    FlutterLocalNotificationsPlugin? localNotifications,
    DeliveredInboxNotifications? delivered,
    NotificationPushRepository? repository,
    Future<void> Function()? initializeNotifications,
    Future<String?> Function()? registrationToken,
    Future<String?> Function()? deviceId,
  }) : _foregroundMessages = foregroundMessages,
       _messagingOverride = messaging,
       _localNotifications =
           localNotifications ?? FlutterLocalNotificationsPlugin(),
       _delivered = delivered ?? DeliveredInboxNotifications.instance,
       _repository =
           repository ?? NotificationPushRepository(ownsApiClient: true),
       _initializeNotifications = initializeNotifications,
       _registrationToken = registrationToken,
       _resolveDeviceId = deviceId;

  static final PushNotificationService instance = PushNotificationService();

  final FlutterLocalNotificationsPlugin _localNotifications;
  final FirebaseMessaging? _messagingOverride;
  final Stream<RemoteMessage>? _foregroundMessages;
  final NotificationPushRepository _repository;
  final DeliveredInboxNotifications _delivered;
  final Future<void> Function()? _initializeNotifications;
  final Future<String?> Function()? _registrationToken;
  final Future<String?> Function()? _resolveDeviceId;
  final StreamController<PushNotificationEvent> _eventsController =
      StreamController<PushNotificationEvent>.broadcast();

  Stream<PushNotificationEvent> get events => _eventsController.stream;

  void notifyArchiveChanged() {
    if (_isDisposed) return;
    _emitEvent(
      const PushNotificationEvent(
        type: PushNotificationEventType.archived,
        request: PushNavigationRequest(notificationId: '', openTarget: 'inbox'),
      ),
    );
  }

  Future<void> Function()? _initializeFirebase;
  bool _firebaseReady = false;
  bool _pushEnabled = true;

  AppFlavor? _appFlavor;
  SettingsRepository? _settingsRepository;
  PushNavigationHandler? _navigationHandler;
  StreamSubscription<RemoteMessage>? _messageSubscription;
  StreamSubscription<RemoteMessage>? _messageOpenedSubscription;
  StreamSubscription<String>? _tokenRefreshSubscription;
  String? _currentUserId;
  int _sessionEpoch = 0;
  PushNavigationRequest? _pendingApproval;
  PushNavigationRequest? _pendingMail;
  PushNavigationRequest? _pendingReminder;
  String? _cachedDeviceId;
  bool _initialized = false;
  Future<void>? _initialization;
  Future<void>? _reminderTimezoneSetup;
  bool _isDisposed = false;
  bool _tokenDeletionPending = false;
  Future<void>? _registration;

  FirebaseMessaging get _messaging =>
      _messagingOverride ?? FirebaseMessaging.instance;

  void configure({
    required AppFlavor appFlavor,
    required SettingsRepository settingsRepository,
    required PushNavigationHandler onOpen,
  }) {
    _appFlavor = appFlavor;
    _settingsRepository = settingsRepository;
    _navigationHandler = onOpen;
  }

  bool get hasActiveSession => _currentUserId != null && !_isDisposed;

  Future<void> initialize() => _ensureInitialized();

  Future<void> scheduleLocalReminder({
    required int id,
    required DateTime scheduledAt,
    required String title,
    required String body,
    required PushNavigationRequest request,
  }) async {
    await _ensureInitialized();
    await (_reminderTimezoneSetup ??= _configureReminderTimezone());
    await _localNotifications.zonedSchedule(
      id: id,
      scheduledDate: timezone.TZDateTime.from(scheduledAt, timezone.local),
      title: title,
      body: body,
      payload: payloadFromPushRequest(request),
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'tuturuuu_reminders',
          'Reminders',
          channelDescription: 'Task and calendar reminders',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
    );
  }

  Future<void> _configureReminderTimezone() async {
    try {
      timezone.setLocalLocation(
        timezoneLocation(await getCurrentTimezoneIdentifier()),
      );
    } on Exception {
      timezone.setLocalLocation(timezone.UTC);
    }
  }

  Future<void> cancelLocalReminder(int id) async {
    await _ensureInitialized();
    await _localNotifications.cancel(id: id);
  }

  Future<Set<int>> pendingLocalReminderIds() async {
    await _ensureInitialized();
    final pending = await _localNotifications.pendingNotificationRequests();
    return pending.map((request) => request.id).toSet();
  }

  Future<bool> get notificationsEnabled async {
    if (_currentUserId == null) return false;
    final settings = await _messaging.getNotificationSettings();
    return _pushEnabled && _isAuthorized(settings);
  }

  Future<void> startSession(String userId) async {
    if (_isDisposed) return;
    final epoch = ++_sessionEpoch;
    _currentUserId = userId;
    if (_initializeFirebase != null) {
      _pushEnabled = await pushEnabled;
      if (!_currentSession(epoch, userId)) return;
      await _initializeFirebase!();
      if (!_currentSession(epoch, userId)) {
        _firebaseReady = true;
        await disableTelemetry();
        return;
      }
      _firebaseReady = true;
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    }
    await _delivered.bindSession(userId);
    if (!_currentSession(epoch, userId)) return;
    await _ensureInitialized();
    if (!_currentSession(epoch, userId)) return;
    await _syncRegistrationIfAuthorized();
    if (!_currentSession(epoch, userId)) return;
    final pending = _pendingApproval;
    if (pending != null) await _openRequest(pending);
    if (!_currentSession(epoch, userId)) return;
    final pendingMail = _pendingMail;
    _pendingMail = null;
    if (pendingMail != null) await _openRequest(pendingMail);
    if (!_currentSession(epoch, userId)) return;
    final pendingReminder = _pendingReminder;
    _pendingReminder = null;

    if (pendingReminder != null) await _openRequest(pendingReminder);
  }

  Future<void> stopSession() async {
    if (_isDisposed) return;
    final epoch = ++_sessionEpoch;
    final userId = _currentUserId;
    _currentUserId = null;
    _pendingMail = null;
    _pendingReminder = null;
    await _delivered.bindSession(null);
    if (!_currentSession(epoch, null)) return;

    if (userId == null || _appFlavor == null) {
      return;
    }

    await _revokeTokenCreation(force: true);
    final deviceId = await _getDeviceId();
    if (deviceId == null || !_currentSession(epoch, null)) {
      return;
    }

    try {
      try {
        await _registration;
      } on Exception {
        // Still remove a stale row.
      }
      await _repository.unregisterDevice(
        deviceId: deviceId,
        appFlavor: _appFlavor!.value,
      );
    } on Exception {
      // Keep sign-out resilient if the device cleanup call fails.
    }
  }

  Future<void> ensurePermissionPrompted() async {
    final userId = _currentUserId;
    final settingsRepository = _settingsRepository;
    if (userId == null || settingsRepository == null || !_pushEnabled) {
      return;
    }

    await _ensureInitialized();

    final hasPrompted = await settingsRepository.hasPromptedPushPermission(
      userId,
    );
    if (!hasPrompted) {
      final settings = await _messaging.requestPermission();
      await settingsRepository.setHasPromptedPushPermission(userId);
      if (_isAuthorized(settings)) {
        await _syncRegistrationIfAuthorized();
      }
      return;
    }

    await _syncRegistrationIfAuthorized();
  }

  Future<void> dispose() async {
    if (_isDisposed) return;
    _isDisposed = true;
    _sessionEpoch++;
    _currentUserId = null;
    unawaited(_delivered.bindSession(null));
    await _messageSubscription?.cancel();
    await _messageOpenedSubscription?.cancel();
    await _tokenRefreshSubscription?.cancel();
    await _eventsController.close();
    _repository.dispose();
  }

  Future<void> _ensureInitialized() async {
    if (_isDisposed || _initialized) return;
    final pending = _initialization;
    if (pending != null) {
      await pending;
      return;
    }
    final initialization = _initialize();
    _initialization = initialization;
    try {
      await initialization;
    } finally {
      _initialization = null;
    }
  }

  Future<void> _initialize() async {
    if (_initializeNotifications != null) {
      await _initializeNotifications();
      _initialized = true;
      return;
    }

    const androidSettings = AndroidInitializationSettings(
      _androidNotificationIcon,
    );
    final darwinSettings = DarwinInitializationSettings(
      notificationCategories: loginNotificationCategories(),
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    await _localNotifications.initialize(
      settings: InitializationSettings(
        android: androidSettings,
        iOS: darwinSettings,
      ),
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        if (payload == null || payload.isEmpty) {
          return;
        }
        unawaited(_handleLocalNotificationPayload(payload));
      },
    );
    if (_isDisposed) return;

    final launchDetails = await _localNotifications
        .getNotificationAppLaunchDetails();
    if (_isDisposed) return;
    final launchPayload = launchDetails?.notificationResponse?.payload;
    if (launchDetails?.didNotificationLaunchApp == true &&
        launchPayload != null &&
        launchPayload.isNotEmpty) {
      final request = requestFromLocalNotificationPayload(launchPayload);
      if (request != null) {
        if (request.openTarget == 'task' || request.openTarget == 'calendar') {
          _pendingReminder = request;
        } else {
          unawaited(_handleLocalNotificationPayload(launchPayload));
        }
      }
    }

    await _createAndroidChannel();
    if (_isDisposed) return;
    if (_initializeFirebase != null && !_firebaseReady) return;

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

    _initialized = true;
  }

  Future<void> _createAndroidChannel() async {
    if (!Platform.isAndroid) {
      return;
    }

    final androidImplementation = _localNotifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    if (androidImplementation == null) {
      return;
    }

    await androidImplementation.createNotificationChannel(
      const AndroidNotificationChannel(
        _pushNotificationChannelId,
        _pushNotificationChannelName,
        description: _pushNotificationChannelDescription,
        importance: Importance.high,
      ),
    );
  }

  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    final request = requestFromPushData(message.data);
    if (request.openTarget == 'mail' &&
        (request.mailDestination == null || request.userId != _currentUserId)) {
      return;
    }
    await _showForegroundNotification(message, request);
    if (!request.hasNavigationMetadata) {
      return;
    }
    _emitEvent(
      PushNotificationEvent(
        type: PushNotificationEventType.received,
        request: request,
      ),
    );
  }

  Future<void> _openRequest(PushNavigationRequest request) async {
    if (_isDisposed) return;
    if (request.openTarget == 'task' || request.openTarget == 'calendar') {
      if (request.userId == null) return;
      if (_currentUserId == null) {
        _pendingReminder = request;
        return;
      }
      if (request.userId != _currentUserId) return;
      _pendingReminder = null;
    }
    if (request.openTarget == 'mail') {
      if (request.mailDestination == null) return;
      if (_currentUserId == null) {
        _pendingMail = request;
        return;
      }
      if (request.userId != _currentUserId) return;
      _pendingMail = null;
    }
    if (request.opensMfaApproval) {
      if (request.expiresAt == null ||
          !request.expiresAt!.isAfter(DateTime.now())) {
        _pendingApproval = null;
        return;
      }
      if (_currentUserId == null) {
        _pendingApproval = request;
        return;
      }
      if (request.userId != _currentUserId) return;
      _pendingApproval = null;
    }
    await _navigationHandler?.call(request);
  }

  Future<void> _handleRemoteMessageOpened(RemoteMessage message) async {
    final request = requestFromPushData(message.data);
    if (!request.hasNavigationMetadata) {
      return;
    }
    _emitEvent(
      PushNotificationEvent(
        type: PushNotificationEventType.opened,
        request: request,
      ),
    );
    await _openRequest(request);
  }

  Future<void> _handleLocalNotificationPayload(String payload) async {
    final request = requestFromLocalNotificationPayload(payload);
    if (request == null) return;

    _emitEvent(
      PushNotificationEvent(
        type: PushNotificationEventType.opened,
        request: request,
      ),
    );
    await _openRequest(request);
  }

  Future<void> _showForegroundNotification(
    RemoteMessage message,
    PushNavigationRequest request,
  ) async {
    final title =
        message.notification?.title ??
        (message.data['title'] as String?) ??
        'Tuturuuu';
    final body =
        message.notification?.body ??
        (message.data['description'] as String?) ??
        '';

    await _localNotifications.show(
      id: message.messageId.hashCode,
      title: title,
      body: body.isEmpty ? null : body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _pushNotificationChannelId,
          _pushNotificationChannelName,
          channelDescription: _pushNotificationChannelDescription,
          importance: Importance.high,
          priority: Priority.high,
          actions: request.opensMfaApproval ? loginNotificationActions() : null,
          icon: _androidNotificationIcon,
          tag: InboxPushIdentity.parse(request.inboxIdentity)?.capsule,
        ),
        iOS: DarwinNotificationDetails(
          categoryIdentifier: request.opensMfaApproval
              ? loginApprovalCategory
              : null,
        ),
      ),
      payload: payloadFromPushRequest(request),
    );
  }

  Future<void> _syncRegistrationIfAuthorized() async {
    final epoch = _sessionEpoch;
    final userId = _currentUserId;
    if (userId == null || !_currentSession(epoch, userId)) return;
    if (_registrationToken != null) {
      final token = await _registrationToken();
      if (!_currentSession(epoch, userId)) return;
      if (token != null && token.isNotEmpty) await _registerDeviceToken(token);
      return;
    }
    final settings = await _messaging.getNotificationSettings();
    if (!_currentSession(epoch, userId)) return;
    if (!_pushEnabled || !_isAuthorized(settings)) {
      await _revokeTokenCreation();
      await _unregisterDevice();
      return;
    }

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
  }

  /// A refreshed token is registered only while notification permission is
  /// still granted; the SDK can rotate tokens independently of the settings.
  Future<void> _registerRefreshedToken(String token) async {
    final epoch = _sessionEpoch;
    final userId = _currentUserId;
    if (userId == null || _isDisposed) return;
    final settings = await _messaging.getNotificationSettings();
    if (!_currentSession(epoch, userId) ||
        !_pushEnabled ||
        !_isAuthorized(settings)) {
      return;
    }
    await _registerDeviceToken(token);
  }

  /// FCM auto-init is disabled natively so no token exists before permission.
  /// If permission was revoked after a token was issued, stop token creation
  /// and drop the local token.
  Future<void> _revokeTokenCreation({
    bool force = false,
    bool strict = false,
  }) async {
    if (_registrationToken != null && _messagingOverride == null) {
      return;
    }
    if (_initializeFirebase != null && !_firebaseReady) return;
    if (force) _tokenDeletionPending = true;
    if (_messaging.isAutoInitEnabled) {
      _tokenDeletionPending = true;
      await _messaging.setAutoInitEnabled(false);
    }
    if (!_tokenDeletionPending) return;
    try {
      await _messaging.deleteToken();
      _tokenDeletionPending = false;
    } on Exception {
      if (strict) rethrow;
      // Token cleanup is best-effort; auto-init stays disabled.
    }
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
      await _repository.registerDevice(
        deviceId: deviceId,
        token: token,
        platform: Platform.isIOS ? 'ios' : 'android',
        appFlavor: appFlavor.value,
      );
    }();
    _registration = registration;
    await registration;
  }

  Future<String?> _getDeviceId() async {
    final cached = _cachedDeviceId;
    if (cached != null && cached.isNotEmpty) {
      return cached;
    }

    final resolved = await (_resolveDeviceId?.call() ?? getDeviceId());
    if (resolved != null && resolved.isNotEmpty) {
      _cachedDeviceId = resolved;
    }
    return resolved;
  }

  bool _isAuthorized(NotificationSettings settings) {
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  bool _currentSession(int epoch, String? actor) =>
      !_isDisposed && _sessionEpoch == epoch && _currentUserId == actor;

  void _emitEvent(PushNotificationEvent event) {
    if (_isDisposed || _eventsController.isClosed) {
      return;
    }
    _eventsController.add(event);
  }
}

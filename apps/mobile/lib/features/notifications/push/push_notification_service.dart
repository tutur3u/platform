import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/utils/device_info.dart';
import 'package:mobile/data/repositories/notification_push_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';

enum PushNotificationEventType {
  received,
  opened,
}

class PushNavigationRequest {
  const PushNavigationRequest({
    required this.notificationId,
    required this.openTarget,
    this.wsId,
    this.entityId,
    this.boardId,
  });

  final String notificationId;
  final String openTarget;
  final String? wsId;
  final String? entityId;
  final String? boardId;

  bool get opensTask =>
      openTarget == 'task' &&
      entityId != null &&
      entityId!.isNotEmpty &&
      boardId != null &&
      boardId!.isNotEmpty;
}

class PushNotificationEvent {
  const PushNotificationEvent({
    required this.type,
    required this.request,
  });

  final PushNotificationEventType type;
  final PushNavigationRequest request;
}

typedef PushNavigationHandler =
    Future<void> Function(
      PushNavigationRequest request,
    );

class PushNotificationService {
  PushNotificationService._();

  static final PushNotificationService instance = PushNotificationService._();

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();
  final NotificationPushRepository _repository = NotificationPushRepository(
    ownsApiClient: true,
  );
  final StreamController<PushNotificationEvent> _eventsController =
      StreamController<PushNotificationEvent>.broadcast();

  Stream<PushNotificationEvent> get events => _eventsController.stream;

  AppFlavor? _appFlavor;
  SettingsRepository? _settingsRepository;
  PushNavigationHandler? _navigationHandler;
  StreamSubscription<RemoteMessage>? _messageSubscription;
  StreamSubscription<RemoteMessage>? _messageOpenedSubscription;
  StreamSubscription<String>? _tokenRefreshSubscription;
  String? _currentUserId;
  String? _cachedDeviceId;
  bool _initialized = false;
  bool _isDisposed = false;

  FirebaseMessaging get _messaging => FirebaseMessaging.instance;

  void configure({
    required AppFlavor appFlavor,
    required SettingsRepository settingsRepository,
    required PushNavigationHandler onOpen,
  }) {
    _appFlavor = appFlavor;
    _settingsRepository = settingsRepository;
    _navigationHandler = onOpen;
  }

  Future<void> startSession(String userId) async {
    _currentUserId = userId;
    await _ensureInitialized();
    await _syncRegistrationIfAuthorized();
  }

  Future<void> stopSession() async {
    final userId = _currentUserId;
    _currentUserId = null;

    if (userId == null || _appFlavor == null) {
      return;
    }

    final deviceId = await _getDeviceId();
    if (deviceId == null) {
      return;
    }

    try {
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
    if (userId == null || settingsRepository == null) {
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
    _isDisposed = true;
    await _messageSubscription?.cancel();
    await _messageOpenedSubscription?.cancel();
    await _tokenRefreshSubscription?.cancel();
    await _eventsController.close();
    _repository.dispose();
  }

  Future<void> _ensureInitialized() async {
    if (_initialized) {
      return;
    }

    const androidSettings = AndroidInitializationSettings(
      '@mipmap/ic_launcher',
    );
    const darwinSettings = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );

    await _localNotifications.initialize(
      settings: const InitializationSettings(
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

    await _createAndroidChannel();

    _messageSubscription = FirebaseMessaging.onMessage.listen((message) {
      unawaited(_handleForegroundMessage(message));
    });
    _messageOpenedSubscription = FirebaseMessaging.onMessageOpenedApp.listen((
      message,
    ) {
      unawaited(_handleRemoteMessageOpened(message));
    });
    _tokenRefreshSubscription = _messaging.onTokenRefresh.listen((token) {
      unawaited(_registerDeviceToken(token));
    });

    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      unawaited(_handleRemoteMessageOpened(initialMessage));
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

    final localeCode =
        WidgetsBinding.instance.platformDispatcher.locale.languageCode;
    final isVietnamese = localeCode.toLowerCase().startsWith('vi');

    await androidImplementation.createNotificationChannel(
      AndroidNotificationChannel(
        'tuturuuu_notifications',
        isVietnamese ? 'Thong bao' : 'Notifications',
        description: isVietnamese
            ? 'Thong bao day cho hop thu Tuturuuu'
            : 'Push notifications for the Tuturuuu inbox',
        importance: Importance.high,
      ),
    );
  }

  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    final request = _requestFromData(message.data);
    await _showForegroundNotification(message, request);
    _emitEvent(
      PushNotificationEvent(
        type: PushNotificationEventType.received,
        request: request,
      ),
    );
  }

  Future<void> _handleRemoteMessageOpened(RemoteMessage message) async {
    final request = _requestFromData(message.data);
    _emitEvent(
      PushNotificationEvent(
        type: PushNotificationEventType.opened,
        request: request,
      ),
    );
    await _navigationHandler?.call(request);
  }

  Future<void> _handleLocalNotificationPayload(String payload) async {
    final decoded = jsonDecode(payload);
    if (decoded is! Map<String, dynamic>) {
      return;
    }

    final request = _requestFromData(decoded);
    _emitEvent(
      PushNotificationEvent(
        type: PushNotificationEventType.opened,
        request: request,
      ),
    );
    await _navigationHandler?.call(request);
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
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'tuturuuu_notifications',
          'Notifications',
          channelDescription: 'Push notifications for the Tuturuuu inbox',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: jsonEncode({
        'notificationId': request.notificationId,
        'openTarget': request.openTarget,
        'wsId': request.wsId,
        'entityId': request.entityId,
        'boardId': request.boardId,
      }),
    );
  }

  PushNavigationRequest _requestFromData(Map<String, dynamic> data) {
    return PushNavigationRequest(
      notificationId: (data['notificationId'] as String?) ?? '',
      openTarget: (data['openTarget'] as String?) ?? 'inbox',
      wsId: data['wsId'] as String?,
      entityId: data['entityId'] as String?,
      boardId: data['boardId'] as String?,
    );
  }

  Future<void> _syncRegistrationIfAuthorized() async {
    final settings = await _messaging.getNotificationSettings();
    if (!_isAuthorized(settings)) {
      return;
    }

    final token = await _messaging.getToken();
    if (token == null || token.isEmpty) {
      return;
    }

    await _registerDeviceToken(token);
  }

  Future<void> _registerDeviceToken(String token) async {
    final userId = _currentUserId;
    final appFlavor = _appFlavor;
    if (userId == null || appFlavor == null) {
      return;
    }

    final deviceId = await _getDeviceId();
    if (deviceId == null) {
      return;
    }

    await _repository.registerDevice(
      deviceId: deviceId,
      token: token,
      platform: Platform.isIOS ? 'ios' : 'android',
      appFlavor: appFlavor.value,
    );
  }

  Future<String?> _getDeviceId() async {
    final cached = _cachedDeviceId;
    if (cached != null && cached.isNotEmpty) {
      return cached;
    }

    final resolved = await getDeviceId();
    if (resolved != null && resolved.isNotEmpty) {
      _cachedDeviceId = resolved;
    }
    return resolved;
  }

  bool _isAuthorized(NotificationSettings settings) {
    return settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  void _emitEvent(PushNotificationEvent event) {
    if (_isDisposed || _eventsController.isClosed) {
      return;
    }
    _eventsController.add(event);
  }
}

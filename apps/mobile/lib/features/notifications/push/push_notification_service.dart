import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/utils/device_info.dart';
import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/repositories/notification_push_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/mail/data/mail_push_destination.dart';
import 'package:mobile/features/notifications/push/login_notification_actions.dart';
import 'package:timezone/data/latest.dart' as timezone_data;
import 'package:timezone/timezone.dart' as timezone;

enum PushNotificationEventType { received, opened, archived }

const _pushNotificationChannelId = 'tuturuuu_notifications';
const _pushNotificationChannelName = 'Notifications';
const _pushNotificationChannelDescription =
    'Push notifications for the Tuturuuu inbox';
const _androidNotificationIcon = 'ic_notification';

class PushNavigationRequest {
  const PushNavigationRequest({
    required this.notificationId,
    required this.openTarget,
    this.wsId,
    this.entityId,
    this.boardId,
    this.conversationId,
    this.messageId,
    this.mailboxId,
    this.threadId,
    this.userId,
    this.expiresAt,
  });

  final String notificationId;
  final String openTarget;
  final String? wsId;
  final String? entityId;
  final String? boardId;
  final String? conversationId;
  final String? messageId;
  final String? mailboxId;
  final String? threadId;
  final String? userId;
  final DateTime? expiresAt;

  MailPushDestination? get mailDestination => openTarget == 'mail'
      ? MailPushDestination.parse({
          'userId': userId,
          'mailboxId': mailboxId,
          'threadId': threadId,
          'notificationId': notificationId,
        })
      : null;

  bool get opensMfaApproval =>
      openTarget == 'mfa_approval' && entityId != null && userId != null;

  bool get opensTask =>
      openTarget == 'task' &&
      entityId != null &&
      entityId!.isNotEmpty &&
      boardId != null &&
      boardId!.isNotEmpty;

  bool get opensChat =>
      openTarget == 'chat' &&
      conversationId != null &&
      conversationId!.isNotEmpty;

  bool get hasNavigationMetadata =>
      notificationId.isNotEmpty ||
      (wsId != null && wsId!.isNotEmpty) ||
      (entityId != null && entityId!.isNotEmpty) ||
      (boardId != null && boardId!.isNotEmpty) ||
      (conversationId != null && conversationId!.isNotEmpty) ||
      (messageId != null && messageId!.isNotEmpty);
}

class PushNotificationEvent {
  const PushNotificationEvent({required this.type, required this.request});

  final PushNotificationEventType type;
  final PushNavigationRequest request;
}

typedef PushNavigationHandler =
    Future<void> Function(PushNavigationRequest request);

String? _stringFromPushData(Map<String, dynamic> data, String key) {
  final value = data[key];
  return value is String ? value : null;
}

PushNavigationRequest requestFromPushData(Map<String, dynamic> data) {
  final openTarget = _stringFromPushData(data, 'openTarget') ?? 'inbox';
  final entityId = _stringFromPushData(data, 'entityId');

  return PushNavigationRequest(
    notificationId: _stringFromPushData(data, 'notificationId') ?? '',
    openTarget: openTarget,
    wsId: _stringFromPushData(data, 'wsId'),
    entityId: entityId,
    boardId: _stringFromPushData(data, 'boardId'),
    conversationId:
        _stringFromPushData(data, 'conversationId') ??
        (openTarget == 'chat' ? entityId : null),
    messageId: _stringFromPushData(data, 'messageId'),
    mailboxId: _stringFromPushData(data, 'mailboxId'),
    threadId: _stringFromPushData(data, 'threadId'),
    userId: _stringFromPushData(data, 'userId'),
    expiresAt: DateTime.tryParse(_stringFromPushData(data, 'expiresAt') ?? ''),
  );
}

PushNavigationRequest? requestFromLocalNotificationPayload(String payload) {
  final Object? decoded;
  try {
    decoded = jsonDecode(payload);
  } on FormatException {
    return null;
  }

  if (decoded is! Map<String, dynamic>) {
    return null;
  }

  final request = requestFromPushData(decoded);
  return request.hasNavigationMetadata ? request : null;
}

String? payloadFromPushRequest(PushNavigationRequest request) {
  if (!request.hasNavigationMetadata) {
    return null;
  }

  return jsonEncode({
    'notificationId': request.notificationId,
    'openTarget': request.openTarget,
    'wsId': request.wsId,
    'entityId': request.entityId,
    'boardId': request.boardId,
    'conversationId': request.conversationId,
    'messageId': request.messageId,
    if (request.mailboxId != null) 'mailboxId': request.mailboxId,
    if (request.threadId != null) 'threadId': request.threadId,
    if (request.userId != null) 'userId': request.userId,
    if (request.expiresAt != null)
      'expiresAt': request.expiresAt!.toIso8601String(),
  });
}

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

  void notifyArchiveChanged() {
    if (_isDisposed) return;
    _emitEvent(
      const PushNotificationEvent(
        type: PushNotificationEventType.archived,
        request: PushNavigationRequest(notificationId: '', openTarget: 'inbox'),
      ),
    );
  }

  AppFlavor? _appFlavor;
  SettingsRepository? _settingsRepository;
  PushNavigationHandler? _navigationHandler;
  StreamSubscription<RemoteMessage>? _messageSubscription;
  StreamSubscription<RemoteMessage>? _messageOpenedSubscription;
  StreamSubscription<String>? _tokenRefreshSubscription;
  String? _currentUserId;
  PushNavigationRequest? _pendingApproval;
  PushNavigationRequest? _pendingMail;
  PushNavigationRequest? _pendingReminder;
  String? _cachedDeviceId;
  bool _initialized = false;
  Future<void>? _reminderTimezoneSetup;
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
    timezone_data.initializeTimeZones();
    try {
      timezone.setLocalLocation(
        timezone.getLocation(await getCurrentTimezoneIdentifier()),
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
    final settings = await _messaging.getNotificationSettings();
    return _isAuthorized(settings);
  }

  Future<void> startSession(String userId) async {
    _currentUserId = userId;
    await _ensureInitialized();
    await _syncRegistrationIfAuthorized();
    final pending = _pendingApproval;
    if (pending != null) await _openRequest(pending);
    final pendingMail = _pendingMail;
    _pendingMail = null;
    if (pendingMail != null) await _openRequest(pendingMail);
    final pendingReminder = _pendingReminder;
    _pendingReminder = null;
    if (pendingReminder != null) await _openRequest(pendingReminder);
  }

  Future<void> stopSession() async {
    final userId = _currentUserId;
    _currentUserId = null;
    _pendingMail = null;
    _pendingReminder = null;

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

    final launchDetails = await _localNotifications
        .getNotificationAppLaunchDetails();
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
    final request = _requestFromData(message.data);
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
    final request = _requestFromData(message.data);
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

  PushNavigationRequest _requestFromData(Map<String, dynamic> data) {
    return requestFromPushData(data);
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

import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/data/repositories/notification_push_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/notifications/push/delivered_inbox_notifications.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mocktail/mocktail.dart';

class _Messaging extends Mock implements FirebaseMessaging {}

class _LocalNotifications extends Mock
    implements FlutterLocalNotificationsPlugin {}

class _Repository extends Mock implements NotificationPushRepository {}

class _Settings extends Mock implements SettingsRepository {}

const _actor = '00000000-0000-4000-8000-000000000001';

NotificationSettings _settings(AuthorizationStatus status) =>
    NotificationSettings(
      alert: AppleNotificationSetting.notSupported,
      announcement: AppleNotificationSetting.notSupported,
      authorizationStatus: status,
      badge: AppleNotificationSetting.notSupported,
      carPlay: AppleNotificationSetting.notSupported,
      lockScreen: AppleNotificationSetting.notSupported,
      notificationCenter: AppleNotificationSetting.notSupported,
      showPreviews: AppleShowPreviewSetting.notSupported,
      timeSensitive: AppleNotificationSetting.notSupported,
      criticalAlert: AppleNotificationSetting.notSupported,
      sound: AppleNotificationSetting.notSupported,
      providesAppNotificationSettings: AppleNotificationSetting.notSupported,
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('test/push_token_permission_gate');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  late _Messaging messaging;
  late _LocalNotifications local;
  late _Repository repository;
  late StreamController<String> refreshes;
  late List<String> registered;
  late List<String> calls;
  late AuthorizationStatus status;
  late PushNotificationService service;

  setUpAll(() {
    registerFallbackValue(const InitializationSettings());
  });

  setUp(() {
    messenger.setMockMethodCallHandler(channel, (_) async => true);
    refreshes = StreamController<String>.broadcast();
    registered = [];
    calls = [];
    status = AuthorizationStatus.notDetermined;
    messaging = _Messaging();
    local = _LocalNotifications();
    repository = _Repository();
    when(
      () => local.initialize(
        settings: any(named: 'settings'),
        onDidReceiveNotificationResponse: any(
          named: 'onDidReceiveNotificationResponse',
        ),
      ),
    ).thenAnswer((_) async => true);
    when(local.getNotificationAppLaunchDetails).thenAnswer((_) async => null);
    when(messaging.getInitialMessage).thenAnswer((_) async => null);
    when(() => messaging.onTokenRefresh).thenAnswer((_) => refreshes.stream);
    when(
      messaging.getNotificationSettings,
    ).thenAnswer((_) async => _settings(status));
    when(() => messaging.isAutoInitEnabled).thenReturn(false);
    when(() => messaging.setAutoInitEnabled(any())).thenAnswer((call) async {
      calls.add('autoInit:${call.positionalArguments.first}');
    });
    when(messaging.getToken).thenAnswer((_) async {
      calls.add('getToken');
      return 'synthetic-token';
    });
    when(messaging.deleteToken).thenAnswer((_) async {
      calls.add('deleteToken');
    });
    when(
      () => repository.registerDevice(
        deviceId: any(named: 'deviceId'),
        token: any(named: 'token'),
        platform: any(named: 'platform'),
        appFlavor: any(named: 'appFlavor'),
      ),
    ).thenAnswer((call) async {
      registered.add(call.namedArguments[#token]! as String);
    });
    when(
      () => repository.unregisterDevice(
        deviceId: any(named: 'deviceId'),
        appFlavor: any(named: 'appFlavor'),
      ),
    ).thenAnswer((_) async {});
    service =
        PushNotificationService(
          foregroundMessages: const Stream.empty(),
          messaging: messaging,
          localNotifications: local,
          delivered: DeliveredInboxNotifications(channel: channel),
          repository: repository,
          deviceId: () async => 'synthetic-device',
        )..configure(
          appFlavor: AppFlavor.development,
          settingsRepository: _Settings(),
          onOpen: (_) async {},
        );
  });

  tearDown(() async {
    await service.dispose();
    await refreshes.close();
    messenger.setMockMethodCallHandler(channel, null);
  });

  Future<void> refresh(String token) async {
    refreshes.add(token);
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
  }

  test('token refresh while unauthorized is not registered', () async {
    await service.startSession(_actor);
    for (final denied in [
      AuthorizationStatus.notDetermined,
      AuthorizationStatus.denied,
    ]) {
      status = denied;
      await refresh('synthetic-refresh-$denied');
    }

    expect(registered, isEmpty);
    verifyNever(
      () => repository.registerDevice(
        deviceId: any(named: 'deviceId'),
        token: any(named: 'token'),
        platform: any(named: 'platform'),
        appFlavor: any(named: 'appFlavor'),
      ),
    );
  });

  for (final granted in [
    AuthorizationStatus.authorized,
    AuthorizationStatus.provisional,
  ]) {
    test('token refresh while $granted is registered', () async {
      status = granted;
      await service.startSession(_actor);
      registered.clear();

      await refresh('synthetic-refresh-token');

      expect(registered, ['synthetic-refresh-token']);
    });
  }

  test('refresh after permission is revoked is not registered', () async {
    status = AuthorizationStatus.authorized;
    await service.startSession(_actor);
    registered.clear();
    status = AuthorizationStatus.denied;

    await refresh('synthetic-late-token');

    expect(registered, isEmpty);
  });

  test('auto-init stays off and no token is read without permission', () async {
    await service.startSession(_actor);

    expect(calls, isEmpty);
    verifyNever(() => messaging.setAutoInitEnabled(true));
    verifyNever(messaging.getToken);
    expect(registered, isEmpty);
  });

  test(
    'auto-init is enabled before the token is read once authorized',
    () async {
      status = AuthorizationStatus.authorized;

      await service.startSession(_actor);

      expect(calls, ['autoInit:true', 'getToken']);
      expect(registered, ['synthetic-token']);
    },
  );

  test('revoked permission disables auto-init and deletes the token', () async {
    when(() => messaging.isAutoInitEnabled).thenReturn(true);
    status = AuthorizationStatus.denied;

    await service.startSession(_actor);

    expect(calls, ['autoInit:false', 'deleteToken']);
    expect(registered, isEmpty);
  });

  test('sign-out still unregisters the device', () async {
    status = AuthorizationStatus.authorized;
    await service.startSession(_actor);

    await service.stopSession();

    verify(
      () => repository.unregisterDevice(
        deviceId: 'synthetic-device',
        appFlavor: AppFlavor.development.value,
      ),
    ).called(1);
  });
}

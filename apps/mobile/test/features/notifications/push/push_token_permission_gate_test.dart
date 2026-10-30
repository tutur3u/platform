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
import 'package:shared_preferences/shared_preferences.dart';

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
    SharedPreferences.setMockInitialValues({});
    messenger
      ..setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/firebase_messaging'),
        (_) async => <String, dynamic>{},
      )
      ..setMockMethodCallHandler(channel, (_) async => true);
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
    messenger
      ..setMockMethodCallHandler(channel, null)
      ..setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/firebase_messaging'),
        null,
      );
  });

  Future<void> refresh(String token) async {
    refreshes.add(token);
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
  }

  test('Firebase startup waits for sign-in', () async {
    var starts = 0;
    service.firebaseInitializer = () async {
      starts++;
    };
    await service.initialize();
    expect(starts, 0);
    verifyNever(messaging.getNotificationSettings);
    await service.startSession(_actor);
    expect(starts, 1);
    verifyNever(messaging.getToken);
  });

  test('push off waits for an outstanding server registration', () async {
    status = AuthorizationStatus.authorized;
    final pending = Completer<void>();
    final entered = Completer<void>();
    when(
      () => repository.registerDevice(
        deviceId: any(named: 'deviceId'),
        token: any(named: 'token'),
        platform: any(named: 'platform'),
        appFlavor: any(named: 'appFlavor'),
      ),
    ).thenAnswer((_) {
      entered.complete();
      return pending.future;
    });
    final starting = service.startSession(_actor);
    await entered.future;
    final stopping = service.setPushEnabled(enabled: false);
    await Future<void>.delayed(Duration.zero);
    verifyNever(
      () => repository.unregisterDevice(
        deviceId: any(named: 'deviceId'),
        appFlavor: any(named: 'appFlavor'),
      ),
    );
    pending.complete();
    await Future.wait([starting, stopping]);
    verify(
      () => repository.unregisterDevice(
        deviceId: 'synthetic-device',
        appFlavor: AppFlavor.development.value,
      ),
    ).called(1);
  });

  test('signed out startup never reads a token', () async {
    await service.initialize();
    await service.ensurePermissionPrompted();
    verifyNever(messaging.getToken);
    verifyNever(() => messaging.setAutoInitEnabled(true));
  });

  test('push off deletes token and unregisters server device', () async {
    status = AuthorizationStatus.authorized;
    await service.startSession(_actor);
    calls.clear();
    when(() => messaging.isAutoInitEnabled).thenReturn(true);
    await service.setPushEnabled(enabled: false);
    expect(calls, ['autoInit:false', 'deleteToken']);
    verify(
      () => repository.unregisterDevice(
        deviceId: 'synthetic-device',
        appFlavor: AppFlavor.development.value,
      ),
    ).called(1);
    calls.clear();
    clearInteractions(messaging);
    await service.startSession(_actor);
    verifyNever(messaging.getToken);
  });

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

  test('failed token deletion retries until cleanup succeeds', () async {
    var autoInitEnabled = true;
    var deletionAttempts = 0;
    when(() => messaging.isAutoInitEnabled).thenAnswer((_) => autoInitEnabled);
    when(() => messaging.setAutoInitEnabled(any())).thenAnswer((call) async {
      autoInitEnabled = call.positionalArguments.first as bool;
      calls.add('autoInit:$autoInitEnabled');
    });
    when(messaging.deleteToken).thenAnswer((_) async {
      calls.add('deleteToken');
      if (++deletionAttempts == 1) {
        throw Exception('temporary deletion failure');
      }
    });
    status = AuthorizationStatus.denied;

    await service.startSession(_actor);
    expect(autoInitEnabled, isFalse);
    expect(calls, ['autoInit:false', 'deleteToken']);

    await service.startSession(_actor);
    expect(calls, ['autoInit:false', 'deleteToken', 'deleteToken']);

    await service.startSession(_actor);
    expect(deletionAttempts, 2);
    expect(calls, ['autoInit:false', 'deleteToken', 'deleteToken']);
    expect(registered, isEmpty);
  });

  test('sign-out still unregisters the device', () async {
    status = AuthorizationStatus.authorized;
    await service.startSession(_actor);

    await service.stopSession();
    expect(calls, contains('deleteToken'));

    verify(
      () => repository.unregisterDevice(
        deviceId: 'synthetic-device',
        appFlavor: AppFlavor.development.value,
      ),
    ).called(1);
  });
}

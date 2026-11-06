import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/core/observability/firebase_admission.dart';
import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:mobile/core/startup/optional_startup.dart';
import 'package:mobile/core/startup/startup_state.dart';
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

const actor = '00000000-0000-4000-8000-000000000001';

/// Contract from #7214/#7294: no Firebase or FCM work before sign-in. The
/// cold-start perf changes (overlapped local reads, deferred push setup) must
/// not move Firebase initialization, enable telemetry before consent is read,
/// or start FCM for a signed-out launch.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('bootstrap join', () {
    late List<String> calls;
    late FirebaseAdmission admission;

    setUp(() {
      calls = [];
      admission = FirebaseAdmission(
        initialize:
            ({
              required signedIn,
              required pushAllowed,
              required telemetryAllowed,
            }) async {
              calls.add('firebase-init');
              return true;
            },
        telemetry: ({required enabled}) async =>
            calls.add('telemetry:$enabled'),
        unregisterPush: () async => calls.add('push-unregistered'),
        deleteInstallation: () async => calls.add('delete-installation'),
      );
      SharedPreferences.setMockInitialValues({});
    });

    test('signed-out launch with stored Allow never initializes Firebase, '
        'even while slow local reads overlap', () async {
      final preferences = Completer<String>();
      final consent = TelemetryPreference();
      final startup = initializeBootstrapServices<String>(
        initializePlatformServices: () => consent.initialize(
          read: () async => true,
          promptEligible: true,
          apply: ({required enabled}) async {
            calls.add('consent-read:$enabled');
            // Same wiring as bootstrap: nobody is signed in yet.
            await admission.update(
              signedIn: false,
              pushAllowed: true,
              telemetryAllowed: enabled,
            );
          },
        ),
        loadLocalPreferences: () => preferences.future,
      );
      await pumpEventQueue();
      // Consent was applied once, while preferences were still loading.
      expect(calls, ['consent-read:true']);
      preferences.complete('route');
      expect(await startup, 'route');
      expect(calls, ['consent-read:true']);
      expect(calls, isNot(contains('firebase-init')));
      expect(calls.where((c) => c.startsWith('telemetry:')), isEmpty);
    });

    test('nothing is applied before consent is read', () async {
      final read = Completer<bool?>();
      final consent = TelemetryPreference();
      final startup = initializeBootstrapServices<void>(
        initializePlatformServices: () => consent.initialize(
          read: () => read.future,
          apply: ({required enabled}) async {
            calls.add('apply:$enabled');
          },
        ),
        loadLocalPreferences: () async {},
      );
      await pumpEventQueue();
      expect(calls, isEmpty);
      read.complete(null);
      await startup;
      expect(calls, ['apply:false']);
    });

    test('a contained Firebase failure does not block local reads', () async {
      final value = await initializeBootstrapServices<String>(
        initializePlatformServices: () async {
          try {
            throw StateError('firebase unavailable');
          } on Object catch (_) {}
        },
        loadLocalPreferences: () async => 'route',
      );
      expect(value, 'route');
    });
  });

  group('deferred push startup', () {
    test('signed-out launch only initializes local push', () async {
      final calls = <String>[];
      await startPushForCurrentAccount(
        currentUserId: () => null,
        initialize: () async => calls.add('initialize'),
        startSession: (id) async => calls.add('session:$id'),
        sessionAlreadyStarted: (_) => true,
      );
      expect(calls, ['initialize']);
    });

    test('skips a duplicate session started before the first frame', () async {
      final calls = <String>[];
      await startPushForCurrentAccount(
        currentUserId: () => 'user-1',
        initialize: () async => calls.add('initialize'),
        startSession: (id) async => calls.add('session:$id'),
        sessionAlreadyStarted: (id) => id == 'user-1',
      );
      expect(calls, isEmpty);
    });

    test('starts the session for a different account', () async {
      final calls = <String>[];
      await startPushForCurrentAccount(
        currentUserId: () => 'user-2',
        initialize: () async {},
        startSession: (id) async => calls.add('session:$id'),
        sessionAlreadyStarted: (id) => id == 'user-1',
      );
      expect(calls, ['session:user-2']);
    });

    testWidgets('a failed deferred startup is contained', (tester) async {
      scheduleOptionalStartup(() => throw StateError('push failed'));
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
      expect(tester.takeException(), isNull);
    });
  });

  group('PushNotificationService cold start', () {
    const channel = MethodChannel('test/cold-start-delivered');
    late _Messaging messaging;
    late _LocalNotifications local;
    late _Repository repository;
    late List<String> firebase;
    late List<PushNavigationRequest> opened;
    late PushNotificationService service;

    setUpAll(() {
      registerFallbackValue(const InitializationSettings());
    });

    Future<void> build({String? launchPayload}) async {
      SharedPreferences.setMockInitialValues({});
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (_) async => true);
      firebase = [];
      opened = [];
      messaging = _Messaging();
      local = _LocalNotifications();
      repository = _Repository();
      when(
        () => repository.unregisterDevice(
          deviceId: any(named: 'deviceId'),
          appFlavor: any(named: 'appFlavor'),
        ),
      ).thenAnswer((_) async {});
      when(
        () => local.initialize(
          settings: any(named: 'settings'),
          onDidReceiveNotificationResponse: any(
            named: 'onDidReceiveNotificationResponse',
          ),
        ),
      ).thenAnswer((_) async => true);
      when(local.getNotificationAppLaunchDetails).thenAnswer(
        (_) async => launchPayload == null
            ? null
            : NotificationAppLaunchDetails(
                true,
                notificationResponse: NotificationResponse(
                  notificationResponseType:
                      NotificationResponseType.selectedNotification,
                  payload: launchPayload,
                ),
              ),
      );
      when(messaging.getNotificationSettings).thenAnswer(
        (_) async => const NotificationSettings(
          alert: AppleNotificationSetting.enabled,
          announcement: AppleNotificationSetting.disabled,
          authorizationStatus: AuthorizationStatus.authorized,
          badge: AppleNotificationSetting.enabled,
          carPlay: AppleNotificationSetting.disabled,
          lockScreen: AppleNotificationSetting.enabled,
          notificationCenter: AppleNotificationSetting.enabled,
          showPreviews: AppleShowPreviewSetting.always,
          timeSensitive: AppleNotificationSetting.disabled,
          criticalAlert: AppleNotificationSetting.disabled,
          sound: AppleNotificationSetting.enabled,
          providesAppNotificationSettings: AppleNotificationSetting.disabled,
        ),
      );
      when(() => messaging.setAutoInitEnabled(any())).thenAnswer((_) async {});
      when(messaging.getToken).thenAnswer((_) async => null);
      when(messaging.getInitialMessage).thenAnswer((_) async => null);
      when(() => messaging.isAutoInitEnabled).thenReturn(false);
      when(
        () => messaging.onTokenRefresh,
      ).thenAnswer((_) => const Stream.empty());
      service =
          PushNotificationService(
              delivered: DeliveredInboxNotifications(channel: channel),
              foregroundMessages: const Stream.empty(),
              messaging: messaging,
              localNotifications: local,
              repository: repository,
              deviceId: () async => 'synthetic-device',
            )
            ..configure(
              appFlavor: AppFlavor.development,
              settingsRepository: _Settings(),
              onOpen: (request) async => opened.add(request),
            )
            ..firebaseInitializer = ({required pushAllowed}) async {
              firebase.add('init:pushAllowed=$pushAllowed');
              return true;
            };
    }

    tearDown(() async {
      await service.dispose();
    });

    test('signed-out initialize never touches Firebase or FCM', () async {
      await build();
      await service.initialize();
      expect(firebase, isEmpty);
      verifyNever(() => messaging.getToken());
      verifyNever(() => messaging.getInitialMessage());
      verifyNever(() => messaging.requestPermission());
      verifyNever(() => messaging.setAutoInitEnabled(any()));
    });

    test('a reminder tap that launched the app is delivered after sign-in, '
        'and Firebase starts only then', () async {
      const request = PushNavigationRequest(
        notificationId: 'n1',
        openTarget: 'task',
        wsId: 'ws-1',
        entityId: 'task-1',
        userId: actor,
      );
      await build(launchPayload: payloadFromPushRequest(request));
      // Push disabled keeps the real FCM static handlers out of the test; the
      // session (and so Firebase admission) still starts after sign-in.
      SharedPreferences.setMockInitialValues({'push-enabled': false});
      // The deferred, signed-out phase.
      await service.initialize();
      expect(opened, isEmpty);
      expect(firebase, isEmpty);
      // Sign-in arrives.
      await service.startSession(actor);
      expect(opened.map((r) => r.entityId), ['task-1']);
      expect(firebase, isNotEmpty);
    });

    test('push disabled never admits FCM after sign-in', () async {
      await build();
      SharedPreferences.setMockInitialValues({'push-enabled': false});
      await service.startSession(actor);
      expect(firebase, everyElement(equals('init:pushAllowed=false')));
      verifyNever(() => messaging.getToken());
    });

    test('a failing Firebase admission fails the session only', () async {
      await build();
      service.firebaseInitializer = ({required pushAllowed}) async =>
          throw StateError('firebase unavailable');
      await expectLater(service.startSession(actor), throwsStateError);
      // The caller (scheduleOptionalStartup) contains and logs the failure.
    });
  });
}

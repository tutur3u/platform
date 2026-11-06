import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/notification_push_repository.dart';
import 'package:mobile/features/notifications/push/delivered_inbox_notifications.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mocktail/mocktail.dart';
import 'package:timezone/timezone.dart' as tz;

class _Messaging extends Mock implements FirebaseMessaging {}

class _LocalNotifications extends Mock
    implements FlutterLocalNotificationsPlugin {}

class _Repository extends Mock implements NotificationPushRepository {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late StreamController<RemoteMessage> messages;
  late _Messaging messaging;
  late _LocalNotifications local;
  late PushNotificationService service;
  late Completer<void> gate;
  late List<String?> shown;
  late List<PushNotificationEvent> events;
  late StreamSubscription<PushNotificationEvent> subscription;

  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('test/init-delivered'),
          (_) async => true,
        );
    messages = StreamController<RemoteMessage>.broadcast();
    gate = Completer<void>();
    messaging = _Messaging();
    local = _LocalNotifications();
    shown = [];
    events = [];
    when(
      () => local.initialize(
        settings: any(named: 'settings'),
        onDidReceiveNotificationResponse: any(
          named: 'onDidReceiveNotificationResponse',
        ),
      ),
    ).thenAnswer((_) async {
      await gate.future;
      return true;
    });
    when(local.getNotificationAppLaunchDetails).thenAnswer((_) async => null);
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
    when(
      () => messaging.onTokenRefresh,
    ).thenAnswer((_) => const Stream.empty());
    when(
      () => local.show(
        id: any(named: 'id'),
        title: any(named: 'title'),
        body: any(named: 'body'),
        notificationDetails: any(named: 'notificationDetails'),
        payload: any(named: 'payload'),
      ),
    ).thenAnswer((call) async {
      shown.add(call.namedArguments[#title] as String?);
    });
    service = PushNotificationService(
      delivered: DeliveredInboxNotifications(
        channel: const MethodChannel('test/init-delivered'),
      ),
      foregroundMessages: messages.stream,
      messaging: messaging,
      localNotifications: local,
      repository: _Repository(),
    );
    subscription = service.events.listen(events.add);
  });
  setUpAll(() {
    registerFallbackValue(tz.TZDateTime.utc(2030));
    registerFallbackValue(AndroidScheduleMode.inexactAllowWhileIdle);
    registerFallbackValue(const InitializationSettings());
    registerFallbackValue(const NotificationDetails());
  });
  tearDown(() async {
    await service.dispose();
    await subscription.cancel();
    unawaited(messages.close());
  });

  test('reminders schedule in the native Asia/Saigon location', () async {
    const channel = MethodChannel('flutter_timezone');
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          ..setMockMethodCallHandler(channel, (_) async => 'Asia/Saigon');
    addTearDown(() {
      messenger.setMockMethodCallHandler(channel, null);
      tz.setLocalLocation(tz.UTC);
    });
    final scheduled = <tz.TZDateTime>[];
    when(
      () => local.zonedSchedule(
        id: any(named: 'id'),
        scheduledDate: any(named: 'scheduledDate'),
        title: any(named: 'title'),
        body: any(named: 'body'),
        payload: any(named: 'payload'),
        notificationDetails: any(named: 'notificationDetails'),
        androidScheduleMode: any(named: 'androidScheduleMode'),
      ),
    ).thenAnswer((call) async {
      scheduled.add(call.namedArguments[#scheduledDate] as tz.TZDateTime);
    });
    gate.complete();
    final instant = DateTime.utc(2030, 1, 1, 20);
    for (var id = 1; id <= 2; id++) {
      await service.scheduleLocalReminder(
        id: id,
        scheduledAt: instant,
        title: 'Reminder',
        body: 'Body',
        request: const PushNavigationRequest(
          notificationId: 'test',
          openTarget: 'calendar',
        ),
      );
    }
    expect(scheduled, hasLength(2));
    for (final date in scheduled) {
      expect(date.location.name, 'Asia/Saigon');
      expect(date.timeZoneOffset, const Duration(hours: 7));
      expect(date.toUtc(), instant);
      expect(date.day, 2);
      expect(date.hour, 3);
    }
  });

  test('overlapping startup installs one foreground receiver '
      'and preserves distinct events', () async {
    final startup = service.startSession('synthetic-actor');
    final restoredSession = service.initialize();
    gate.complete();
    await Future.wait([startup, restoredSession]);
    for (var i = 1; i <= 2; i++) {
      messages.add(
        RemoteMessage(
          messageId: 'transport-$i',
          data: {'notificationId': 'notification-$i', 'title': 'Synthetic $i'},
        ),
      );
      await Future<void>.delayed(Duration.zero);
    }
    expect(shown, ['Synthetic 1', 'Synthetic 2']);
    expect(events.map((event) => event.request.notificationId), [
      'notification-1',
      'notification-2',
    ]);
    await service.initialize();
    verify(
      () => local.initialize(
        settings: any(named: 'settings'),
        onDidReceiveNotificationResponse: any(
          named: 'onDidReceiveNotificationResponse',
        ),
      ),
    ).called(1);
  });

  test(
    'foreground delivery stays active while initial lookup is pending',
    () async {
      final lookup = Completer<RemoteMessage?>();
      final entered = Completer<void>();
      when(messaging.getInitialMessage).thenAnswer((_) {
        entered.complete();
        return lookup.future;
      });
      gate.complete();
      final initializing = service.startSession('synthetic-actor');
      await entered.future;
      messages.add(
        const RemoteMessage(
          messageId: 'held-transport',
          data: {
            'notificationId': 'held-notification',
            'title': 'During lookup',
          },
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(shown, ['During lookup']);
      expect(events.map((event) => event.request.notificationId), [
        'held-notification',
      ]);
      lookup.complete();
      await initializing;
    },
  );

  test('failed initial-message lookup retries without retaining '
      'a foreground receiver', () async {
    when(
      messaging.getInitialMessage,
    ).thenThrow(StateError('synthetic failure'));
    gate.complete();
    await expectLater(
      service.startSession('synthetic-actor'),
      throwsStateError,
    );
    messages.add(
      const RemoteMessage(
        messageId: 'after-failure',
        data: {'notificationId': 'after-failure', 'title': 'Must not deliver'},
      ),
    );
    await Future<void>.delayed(Duration.zero);
    expect(shown, isEmpty);
    expect(events, isEmpty);
    when(messaging.getInitialMessage).thenAnswer((_) async => null);
    await service.startSession('synthetic-actor');
    messages.add(
      const RemoteMessage(
        messageId: 'transport',
        data: {'notificationId': 'notification', 'title': 'Synthetic'},
      ),
    );
    await Future<void>.delayed(Duration.zero);
    expect(shown, ['Synthetic']);
    expect(events, hasLength(1));
  });

  test('disposal during initial lookup cancels the active receiver', () async {
    final lookup = Completer<RemoteMessage?>();
    final entered = Completer<void>();
    when(messaging.getInitialMessage).thenAnswer((_) {
      entered.complete();
      return lookup.future;
    });
    gate.complete();
    final initializing = service.startSession('synthetic-actor');
    await entered.future;
    await service.dispose();
    messages.add(
      const RemoteMessage(
        messageId: 'after-disposal',
        data: {'notificationId': 'after-disposal', 'title': 'Must not deliver'},
      ),
    );
    lookup.complete();
    await initializing;
    await Future<void>.delayed(Duration.zero);
    expect(shown, isEmpty);
    expect(events, isEmpty);
  });

  test('disposal during initialization never installs a receiver', () async {
    final initializing = service.startSession('synthetic-actor');
    await service.dispose();
    gate.complete();
    await initializing;
    messages.add(
      const RemoteMessage(
        messageId: 'transport',
        data: {'notificationId': 'notification', 'title': 'Synthetic'},
      ),
    );
    await Future<void>.delayed(Duration.zero);
    expect(shown, isEmpty);
    expect(events, isEmpty);
  });
}

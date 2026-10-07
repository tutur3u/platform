import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/app_flavor.dart';
import 'package:mobile/data/repositories/notification_push_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/notifications/push/delivered_inbox_notifications.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements NotificationPushRepository {}

class _Settings extends Mock implements SettingsRepository {}

const actor = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('test/push_service_session');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  late _Repository repository;
  late List<String> writes;
  setUp(() {
    writes = [];
    repository = _Repository();
    when(
      () => repository.registerDevice(
        deviceId: any(named: 'deviceId'),
        token: any(named: 'token'),
        platform: any(named: 'platform'),
        appFlavor: any(named: 'appFlavor'),
      ),
    ).thenAnswer((invocation) async {
      writes.add(invocation.namedArguments[#token]! as String);
    });
    when(
      () => repository.unregisterDevice(
        deviceId: any(named: 'deviceId'),
        appFlavor: any(named: 'appFlavor'),
      ),
    ).thenAnswer((_) async {});
    messenger.setMockMethodCallHandler(channel, (_) async => true);
  });
  tearDown(() => messenger.setMockMethodCallHandler(channel, null));

  PushNotificationService service({
    required Future<void> Function() initialize,
    Future<String?> Function()? token,
    Future<String?> Function()? device,
  }) {
    final result =
        PushNotificationService(
          delivered: DeliveredInboxNotifications(channel: channel),
          repository: repository,
          initializeNotifications: initialize,
          registrationToken: token ?? () async => null,
          deviceId: device ?? () async => 'synthetic-device',
        )..configure(
          appFlavor: AppFlavor.development,
          settingsRepository: _Settings(),
          onOpen: (_) async =>
              fail('No pending navigation is admitted in this fixture'),
        );
    return result;
  }

  for (final departure in ['logout', 'other', 'ABA', 'dispose']) {
    test('held real startSession cannot continue after $departure', () async {
      final held = Completer<Object?>();
      final entered = Completer<void>();
      var bindings = 0;
      messenger.setMockMethodCallHandler(channel, (_) async {
        if (++bindings == 1) {
          entered.complete();
          return await held.future;
        }
        return true;
      });
      var initializations = 0;
      final push = service(
        initialize: () async {
          initializations++;
        },
      );
      final starting = push.startSession(actor);
      await entered.future;
      var admittedNewStarts = 0;
      if (departure == 'dispose') {
        await push.dispose();
      } else {
        await push.stopSession();
        if (departure != 'logout') {
          await push.startSession(departure == 'ABA' ? actor : other);
          admittedNewStarts++;
        }
      }
      held.complete(true);
      await starting;
      expect(initializations, admittedNewStarts);
      expect(writes, isEmpty);
      if (departure != 'dispose') await push.dispose();
    });
  }

  test('registration rejects held device ID after actor ABA', () async {
    final heldDevice = Completer<String?>();
    final entered = Completer<void>();
    var devices = 0;
    var tokens = 0;
    final push = service(
      initialize: () async {},
      token: () async => 'synthetic-token-${++tokens}',
      device: () async {
        if (++devices == 1) {
          entered.complete();
          return await heldDevice.future;
        }
        return 'synthetic-device';
      },
    );
    final old = push.startSession(actor);
    await entered.future;
    await push.stopSession();
    await push.startSession(actor);
    expect(writes, ['synthetic-token-2']);
    heldDevice.complete('synthetic-device');
    await old;
    expect(writes, ['synthetic-token-2']);
    await push.dispose();
  });

  test('same admitted session runs actual registration helper once', () async {
    var initializations = 0;
    final push = service(
      initialize: () async {
        initializations++;
      },
      token: () async => 'synthetic-current-token',
    );
    await push.startSession(actor);
    expect(initializations, 1);
    expect(writes, ['synthetic-current-token']);
    await push.dispose();
  });

  test('held initialization cannot request token after disposal', () async {
    final initialized = Completer<void>();
    final entered = Completer<void>();
    var tokenRequests = 0;
    final push = service(
      initialize: () async {
        entered.complete();
        await initialized.future;
      },
      token: () async {
        tokenRequests++;
        return 'synthetic-token';
      },
    );
    final starting = push.startSession(actor);
    await entered.future;
    await push.dispose();
    initialized.complete();
    await starting;
    await push.startSession(actor);
    expect(tokenRequests, 0);
    expect(writes, isEmpty);
  });

  test(
    'held token lookup is not rebound to a newer same-actor session',
    () async {
      final held = Completer<String?>();
      final entered = Completer<void>();
      var tokens = 0;
      final push = service(
        initialize: () async {},
        token: () async {
          if (++tokens == 1) {
            entered.complete();
            return await held.future;
          }
          return 'synthetic-current-token';
        },
      );
      final old = push.startSession(actor);
      await entered.future;
      await push.stopSession();
      await push.startSession(actor);
      held.complete('synthetic-old-token');
      await old;
      expect(writes, ['synthetic-current-token']);
      await push.dispose();
    },
  );
}

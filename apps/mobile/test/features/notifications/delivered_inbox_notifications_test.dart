import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/notifications/push/delivered_inbox_notifications.dart';
import 'package:mobile/features/notifications/push/inbox_push_identity.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';

const actor = '00000000-0000-4000-8000-000000000001';
const workspace = '00000000-0000-4000-8000-000000000002';
const notification = '00000000-0000-4000-8000-000000000003';
const other = '00000000-0000-4000-8000-000000000004';
String capsule(Object? ws) =>
    InboxPushIdentity.prefix +
    base64Url
        .encode(utf8.encode(jsonEncode([actor, ws, notification])))
        .replaceAll('=', '');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('persisted inbox metadata', () {
    test(
      'canonical workspace and personal capsules retain actual inbox scope',
      () {
        expect(
          InboxPushIdentity.parse(capsule(workspace))?.workspaceId,
          workspace,
        );
        expect(InboxPushIdentity.parse(capsule(null))?.workspaceId, isNull);
        final request = requestFromPushData({
          'notificationId': notification,
          'wsId': workspace,
          'inboxIdentity': capsule(null),
        });
        final restored = requestFromLocalNotificationPayload(
          payloadFromPushRequest(request)!,
        )!;
        expect(restored.inboxIdentity, capsule(null));
        expect(restored.wsId, workspace);
        expect(
          InboxPushIdentity.parse(restored.inboxIdentity)?.workspaceId,
          isNull,
        );
      },
    );

    test(
      'malformed, padded, noncanonical and legacy capsules remain unowned',
      () {
        for (final value in [
          null,
          'legacy-message',
          '${capsule(workspace)}=',
          capsule('not-a-workspace'),
          InboxPushIdentity.prefix +
              base64Url
                  .encode(utf8.encode(' ["$actor",null,"$notification"]'))
                  .replaceAll('=', ''),
        ]) {
          expect(InboxPushIdentity.parse(value), isNull);
        }
        expect(
          payloadFromPushRequest(
            const PushNavigationRequest(
              notificationId: notification,
              openTarget: 'inbox',
              inboxIdentity: 'legacy',
            ),
          ),
          isNot(contains('inboxIdentity')),
        );
      },
    );
  });

  group('actual MethodChannel adapter admission', () {
    const channel = MethodChannel('test/delivered_inbox_notifications');
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    late DeliveredInboxNotifications bridge;
    late List<MethodCall> calls;
    late Future<Object?> Function(MethodCall) response;
    setUp(() {
      bridge = DeliveredInboxNotifications(channel: channel);
      calls = [];
      response = (call) async => switch (call.method) {
        'bindSession' => true,
        'snapshot' => {'token': 'synthetic-snapshot', 'count': 2},
        'dismissSnapshot' => 2,
        'discardSnapshot' => true,
        _ => throw UnsupportedError(call.method),
      };
      messenger.setMockMethodCallHandler(channel, (call) {
        calls.add(call);
        return response(call);
      });
    });
    tearDown(() => messenger.setMockMethodCallHandler(channel, null));

    test(
      'unbound or foreign actor cannot invoke delivered enumeration',
      () async {
        await expectLater(bridge.snapshot(actor: actor), throwsStateError);
        await bridge.bindSession(actor);
        await expectLater(bridge.snapshot(actor: other), throwsStateError);
        expect(calls.map((call) => call.method), ['bindSession']);
      },
    );

    test(
      'allActor versus exactWorkspace follows actual bulk read semantics',
      () async {
        await bridge.bindSession(actor);
        await bridge.snapshot(actor: actor);
        await bridge.snapshot(
          actor: actor,
          workspaceId: workspace,
          notificationId: notification,
        );
        final allArgs = calls[1].arguments as Map<Object?, Object?>;
        final exactArgs = calls[2].arguments as Map<Object?, Object?>;
        expect(allArgs['scope'], 'allActor');
        expect(allArgs['workspaceId'], isNull);
        expect(exactArgs['scope'], 'exactWorkspace');
        expect(exactArgs['workspaceId'], workspace);
        expect(exactArgs['notificationId'], notification);
      },
    );

    test(
      'actor logout/relogin ABA rejects captured snapshot without dismiss dispatch',
      () async {
        await bridge.bindSession(actor);
        final snapshot = await bridge.snapshot(actor: actor);
        await bridge.bindSession(null);
        await bridge.bindSession(actor);
        await expectLater(bridge.dismissSnapshot(snapshot), throwsStateError);
        expect(calls.any((call) => call.method == 'dismissSnapshot'), isFalse);
      },
    );

    test(
      'held enumeration cannot publish a snapshot after actor ABA',
      () async {
        final held = Completer<Object?>();
        final initial = response;
        response = (call) =>
            call.method == 'snapshot' ? held.future : initial(call);
        await bridge.bindSession(actor);
        final snapshot = bridge.snapshot(actor: actor);
        final denied = expectLater(snapshot, throwsStateError);
        await bridge.bindSession(other);
        await bridge.bindSession(actor);
        held.complete({'token': 'old-snapshot', 'count': 1});
        await denied;
      },
    );

    test('held binding cannot overwrite a newer session readiness', () async {
      final held = Completer<Object?>();
      var bindings = 0;
      response = (call) async {
        if (call.method == 'bindSession') {
          if (++bindings == 1) return await held.future;
          return true;
        }
        return {'token': 'current', 'count': 0};
      };
      final old = bridge.bindSession(actor);
      await bridge.bindSession(other);
      held.complete(true);
      expect(await old, isFalse);
      await expectLater(bridge.snapshot(actor: actor), throwsStateError);
      expect((await bridge.snapshot(actor: other)).count, 0);
    });

    test(
      'failed native bind is unavailable rather than a ready receipt',
      () async {
        response = (_) async => throw PlatformException(code: 'unavailable');
        expect(await bridge.bindSession(actor), isFalse);
        await expectLater(bridge.snapshot(actor: actor), throwsStateError);
      },
    );

    test('invalid or overflowing snapshots fail closed', () async {
      await bridge.bindSession(actor);
      for (final invalid in [
        {'token': '', 'count': 1},
        {'token': 'snapshot', 'count': 513},
        {'token': 'snapshot', 'count': -1},
        {'token': 'snapshot', 'count': '1'},
      ]) {
        response = (_) async => invalid;
        await expectLater(bridge.snapshot(actor: actor), throwsFormatException);
      }
    });

    test(
      'discard releases token without any dismiss or scheduling method',
      () async {
        await bridge.bindSession(actor);
        final snapshot = await bridge.snapshot(actor: actor);
        await bridge.discardSnapshot(snapshot);
        expect(calls.map((call) => call.method), [
          'bindSession',
          'snapshot',
          'discardSnapshot',
        ]);
      },
    );

    test(
      'native cleanup failure is not a successful dismissal receipt',
      () async {
        await bridge.bindSession(actor);
        final snapshot = await bridge.snapshot(actor: actor);
        response = (_) async => throw PlatformException(code: 'unavailable');
        await expectLater(
          bridge.dismissSnapshot(snapshot),
          throwsA(isA<PlatformException>()),
        );
      },
    );

    test(
      'dismissal count cannot exceed the actual captured snapshot',
      () async {
        await bridge.bindSession(actor);
        final snapshot = await bridge.snapshot(actor: actor);
        response = (_) async => 3;
        await expectLater(
          bridge.dismissSnapshot(snapshot),
          throwsFormatException,
        );
      },
    );
  });
}

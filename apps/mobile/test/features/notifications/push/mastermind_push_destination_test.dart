import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';

void main() {
  // The web route sends exactly this shape: no notification id, no workspace.
  Map<String, dynamic> payload(Object? route) => {
    'openTarget': 'mastermind',
    'route': route,
  };

  group('Mastermind push destination', () {
    for (final route in [Routes.mastermindInbox, Routes.mastermind]) {
      test('opens the allowlisted tab root $route', () {
        final request = requestFromPushData(payload(route));

        expect(request.hasNavigationMetadata, isTrue);
        expect(request.mastermindLocation, route);
      });
    }

    test('falls back to notifications for any other route', () {
      for (final route in [
        null,
        '',
        123,
        '/mastermind/',
        '/mastermind/work',
        '/mastermind/inbox/item/item-0123456789abcdef0123',
        '/mastermind/inbox?x=1',
        '/mastermind/../settings',
        'https://evil.example/mastermind',
        '/settings',
      ]) {
        final request = requestFromPushData(payload(route));

        expect(request.hasNavigationMetadata, isTrue, reason: '$route');
        expect(
          request.mastermindLocation,
          Routes.notifications,
          reason: '$route',
        );
      }
    });

    test('ignores a route on any other open target', () {
      final request = requestFromPushData({
        'openTarget': 'chat',
        'route': Routes.mastermindInbox,
      });

      expect(request.mastermindLocation, isNull);
    });

    test('survives a foreground local notification tap', () {
      final remote = requestFromPushData(payload(Routes.mastermindInbox));
      final encoded = payloadFromPushRequest(remote);

      expect(encoded, isNotNull);
      expect(jsonDecode(encoded!), containsPair('route', '/mastermind/inbox'));
      final local = requestFromLocalNotificationPayload(encoded)!;
      expect(local.openTarget, 'mastermind');
      expect(local.mastermindLocation, Routes.mastermindInbox);
    });
  });
}

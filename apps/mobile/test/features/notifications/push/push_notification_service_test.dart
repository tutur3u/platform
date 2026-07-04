import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';

void main() {
  group('push chat navigation payloads', () {
    test('parses chat open targets from direct chat metadata', () {
      final request = requestFromPushData({
        'notificationId': 'notification-1',
        'openTarget': 'chat',
        'wsId': 'ws-1',
        'conversationId': 'conversation-1',
        'messageId': 'message-1',
      });

      expect(request.opensChat, isTrue);
      expect(request.conversationId, 'conversation-1');
      expect(request.messageId, 'message-1');
    });

    test('falls back to entity id for chat conversation notifications', () {
      final request = requestFromPushData({
        'notificationId': 'notification-2',
        'openTarget': 'chat',
        'entityType': 'chat_conversation',
        'entityId': 'conversation-2',
      });

      expect(request.opensChat, isTrue);
      expect(request.conversationId, 'conversation-2');
    });

    test('serializes chat navigation payloads for local notification taps', () {
      const request = PushNavigationRequest(
        notificationId: 'notification-3',
        openTarget: 'chat',
        wsId: 'ws-2',
        conversationId: 'conversation-3',
        messageId: 'message-3',
      );

      final encoded = payloadFromPushRequest(request);
      expect(encoded, isNotNull);
      expect(jsonDecode(encoded!), {
        'notificationId': 'notification-3',
        'openTarget': 'chat',
        'wsId': 'ws-2',
        'entityId': null,
        'boardId': null,
        'conversationId': 'conversation-3',
        'messageId': 'message-3',
      });
    });

    test('ignores invalid local notification payload JSON', () {
      expect(requestFromLocalNotificationPayload('not-json'), isNull);
      expect(
        requestFromLocalNotificationPayload(jsonEncode(['not', 'an object'])),
        isNull,
      );
    });

    test('ignores forged non-string local notification fields', () {
      final request = requestFromLocalNotificationPayload(
        jsonEncode({
          'notificationId': 123,
          'openTarget': 'task',
          'wsId': ['ws-1'],
          'entityId': true,
          'boardId': {'id': 'board-1'},
          'conversationId': 456,
          'messageId': 789,
        }),
      );

      expect(request, isNull);
    });

    test('parses valid local notification payloads', () {
      final request = requestFromLocalNotificationPayload(
        jsonEncode({
          'notificationId': 'notification-4',
          'openTarget': 'task',
          'wsId': 'ws-4',
          'entityId': 'task-4',
          'boardId': 'board-4',
        }),
      );

      expect(request, isNotNull);
      expect(request!.opensTask, isTrue);
      expect(request.notificationId, 'notification-4');
      expect(request.wsId, 'ws-4');
      expect(request.entityId, 'task-4');
      expect(request.boardId, 'board-4');
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/features/mail/data/mail_push_destination.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/notifications/widgets/notification_destination.dart';

void main() {
  const user = '10000000-0000-4000-8000-000000000001';
  const box = '10000000-0000-4000-8000-000000000002';
  const thread = '10000000-0000-4000-8000-000000000003';
  const notification = '10000000-0000-4000-8000-000000000004';
  final payload = <String, dynamic>{
    'openTarget': 'mail',
    'userId': user,
    'mailboxId': box,
    'threadId': thread,
    'notificationId': notification,
  };

  test('personal Mail destination survives a local notification tap', () {
    final remote = requestFromPushData(payload);
    final local = requestFromLocalNotificationPayload(
      payloadFromPushRequest(remote)!,
    )!;
    final target = local.mailDestination!;
    expect(target.userId, user);
    expect(target.mailboxId, box);
    expect(target.threadId, thread);
    expect(local.wsId, isNull);
    final uri = Uri.parse(target.location);
    expect(uri.path, '/mail');
    expect(MailPushDestination.parse(uri.queryParameters)?.threadId, thread);
  });

  for (final field in ['userId', 'mailboxId', 'threadId', 'notificationId']) {
    test('rejects missing or untrusted $field before navigation', () {
      for (final invalid in [null, '', '../other', 123, <String>[]]) {
        final request = requestFromPushData({...payload, field: invalid});
        expect(request.mailDestination, isNull);
      }
    });
  }

  test(
    'notification inbox opens Mail without treating the message as a workspace',
    () {
      final item = AppNotification.fromJson({
        'id': notification,
        'user_id': user,
        'type': 'mail_received',
        'entity_type': 'mail_message',
        'entity_id': thread,
        'data': {...payload, 'messageId': thread},
      });
      expect(Uri.parse(notificationDestination(item)!).path, '/mail');
      expect(item.workspaceId, isNull);
      expect(
        notificationDestination(
          item.copyWith(data: {...item.data, 'userId': box}),
        ),
        isNull,
      );
    },
  );

  test('Mail metadata does not override another notification type', () {
    expect(
      requestFromPushData({...payload, 'openTarget': 'chat'}).mailDestination,
      isNull,
    );
  });
}

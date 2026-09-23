import 'package:mobile/core/router/routes.dart';

/// Navigation metadata is a hint. Mail APIs still authorize the current
/// account before displaying any mailbox or message.
class MailPushDestination {
  const MailPushDestination({
    required this.userId,
    required this.mailboxId,
    required this.threadId,
    required this.notificationId,
  });

  final String userId;
  final String mailboxId;
  final String threadId;
  final String notificationId;

  static final _uuid = RegExp(
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}'
    r'-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
  );

  static MailPushDestination? parse(Map<String, dynamic> values) {
    final user = values['userId'];
    final mailbox = values['mailboxId'];
    final thread = values['threadId'];
    final notification = values['notificationId'];
    if ([
      user,
      mailbox,
      thread,
      notification,
    ].any((value) => value is! String || !_uuid.hasMatch(value))) {
      return null;
    }
    return MailPushDestination(
      userId: user as String,
      mailboxId: mailbox as String,
      threadId: thread as String,
      notificationId: notification as String,
    );
  }

  String get location => Uri(
    path: Routes.mail,
    queryParameters: {
      'userId': userId,
      'mailboxId': mailboxId,
      'threadId': threadId,
      'notificationId': notificationId,
    },
  ).toString();
}

import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/features/mail/data/mail_push_destination.dart';

String? notificationDestination(AppNotification notification) {
  final entityId = notification.entityId;
  if (entityId == null || entityId.isEmpty) return null;
  if (notification.entityType == 'mail_message') {
    if (notification.type != 'mail_received' ||
        notification.data['messageId'] != entityId ||
        notification.data['userId'] != notification.userId) {
      return null;
    }
    return MailPushDestination.parse({
      ...notification.data,
      'notificationId': notification.id,
      'userId': notification.userId,
    })?.location;
  }
  return switch (notification.entityType) {
    'task' =>
      notification.boardId == null || notification.boardId!.isEmpty
          ? null
          : Uri(
              path: Routes.taskBoardDetailPath(notification.boardId!),
              queryParameters: {'taskId': entityId},
            ).toString(),
    'time_tracking_request' => Routes.timerRequestsPath(
      requestId: entityId,
      status: 'all',
    ),
    _ => null,
  };
}

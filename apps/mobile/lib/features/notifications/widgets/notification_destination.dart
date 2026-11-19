import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/features/mail/data/mail_push_destination.dart';

/// In-app location a notification opens, or null when the app has no screen
/// for its target. Callers fall back to the notification's own details.
String? notificationDestination(AppNotification notification) {
  final entityId = _nonEmpty(notification.entityId);
  final data = notification.data;
  final openTarget = _nonEmpty(data['openTarget']);
  switch (notification.entityType) {
    case 'mail_message':
      if (entityId == null ||
          notification.type != 'mail_received' ||
          data['messageId'] != entityId ||
          data['userId'] != notification.userId) {
        return null;
      }
      return MailPushDestination.parse({
        ...data,
        'notificationId': notification.id,
        'userId': notification.userId,
      })?.location;
    case 'task':
      final boardId = _nonEmpty(notification.boardId);
      if (entityId == null || boardId == null) return null;
      return Uri(
        path: Routes.taskBoardDetailPath(boardId),
        queryParameters: {'taskId': entityId},
      ).toString();
    case 'time_tracking_request':
      if (entityId == null) return null;
      return Routes.timerRequestsPath(requestId: entityId, status: 'all');
    case 'transaction' || 'finance_transaction':
      if (entityId == null) return null;
      return Routes.transactionDetailsLocation(entityId);
    case 'workspace':
      return entityId == null ? null : Routes.home;
  }
  final conversationId =
      _nonEmpty(data['conversation_id']) ?? _nonEmpty(data['conversationId']);
  if (notification.entityType == 'chat_conversation' || openTarget == 'chat') {
    final id =
        conversationId ??
        (notification.entityType == 'chat_conversation' ? entityId : null);
    return id == null ? null : Routes.chatConversationPath(id);
  }
  if (notification.entityType == 'event' ||
      notification.entityType == 'calendar_event' ||
      openTarget == 'calendar') {
    final eventId = _nonEmpty(data['event_id']) ?? entityId;
    return eventId == null ? null : Routes.calendarEventDetailPath(eventId);
  }
  return null;
}

String? _nonEmpty(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

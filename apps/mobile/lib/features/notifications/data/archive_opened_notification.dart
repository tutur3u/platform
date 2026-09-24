import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';

/// Keep navigation responsive while syncing the opened item out of Inbox.
Future<void> archiveOpenedNotification(String notificationId) async {
  if (notificationId.isEmpty) return;
  final repository = NotificationsRepository(ownsApiClient: true);
  try {
    await repository.markRead(id: notificationId, read: true);
    PushNotificationService.instance.notifyArchiveChanged();
  } on Object {
    // Opening a destination remains immediate when archive sync is unavailable.
  } finally {
    repository.dispose();
  }
}

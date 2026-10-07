import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/data/repositories/notifications_repository.dart';
import 'package:mobile/features/notifications/data/notification_read_cleanup.dart';
import 'package:mobile/features/notifications/push/delivered_inbox_notifications.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';

/// Keep navigation responsive while syncing the opened item out of Inbox.
Future<void> archiveOpenedNotification(
  String notificationId, {
  NotificationsRepository? notificationsRepository,
  String? Function()? currentUserId,
}) async {
  if (notificationId.isEmpty) return;
  final repository =
      notificationsRepository ?? NotificationsRepository(ownsApiClient: true);
  final resolveActor = currentUserId ?? currentCacheUserId;
  final actor = resolveActor();
  final bridge = DeliveredInboxNotifications.instance;
  final session = actor == null ? null : bridge.captureSession(actor);
  bool current() =>
      actor != null &&
      actor == resolveActor() &&
      session != null &&
      bridge.isCurrentSession(session);
  try {
    final result = await readWithDeliveredCleanup(
      actor: actor,
      isCurrent: current,
      notificationId: notificationId,
      read: () => repository.markRead(id: notificationId, read: true),
    );
    if (current() &&
        (result == NotificationReadResult.accepted ||
            result == NotificationReadResult.acceptedCleanupUnavailable)) {
      PushNotificationService.instance.notifyArchiveChanged();
    }
  } on Object {
    // Opening a destination remains immediate when archive sync is unavailable.
  } finally {
    if (notificationsRepository == null) repository.dispose();
  }
}

import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

/// Recency bucket used to caption groups in the notifications feed.
enum NotificationDayBucket {
  today,
  yesterday,
  lastWeek,
  earlier;

  String label(AppLocalizations l10n) => switch (this) {
    NotificationDayBucket.today => l10n.notificationsGroupToday,
    NotificationDayBucket.yesterday => l10n.notificationsGroupYesterday,
    NotificationDayBucket.lastWeek => l10n.notificationsGroupLastWeek,
    NotificationDayBucket.earlier => l10n.notificationsGroupEarlier,
  };
}

/// Consecutive notifications that share a [bucket].
class NotificationDayGroup {
  const NotificationDayGroup(this.bucket, this.items);

  final NotificationDayBucket bucket;
  final List<AppNotification> items;
}

NotificationDayBucket notificationDayBucket(DateTime createdAt, DateTime now) {
  final local = createdAt.toLocal();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(local.year, local.month, local.day);
  final days = today.difference(day).inDays;
  if (days <= 0) return NotificationDayBucket.today;
  if (days == 1) return NotificationDayBucket.yesterday;
  if (days < 7) return NotificationDayBucket.lastWeek;
  return NotificationDayBucket.earlier;
}

/// Splits [items] into runs of the same recency bucket, keeping the feed's
/// order. The feed is newest first, so each bucket normally appears once; an
/// out-of-order item starts a new run instead of being moved.
List<NotificationDayGroup> groupNotificationsByDay(
  List<AppNotification> items,
  DateTime now,
) {
  final groups = <NotificationDayGroup>[];
  for (final item in items) {
    final bucket = notificationDayBucket(item.createdAt, now);
    if (groups.isNotEmpty && groups.last.bucket == bucket) {
      groups.last.items.add(item);
    } else {
      groups.add(NotificationDayGroup(bucket, [item]));
    }
  }
  return groups;
}

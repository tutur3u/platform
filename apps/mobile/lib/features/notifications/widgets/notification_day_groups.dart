import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

/// Recency bucket used to caption groups in the notifications feed.
enum NotificationDayBucket {
  today,
  yesterday,
  earlier;

  String label(AppLocalizations l10n) => switch (this) {
    NotificationDayBucket.today => l10n.notificationsGroupToday,
    NotificationDayBucket.yesterday => l10n.notificationsGroupYesterday,
    NotificationDayBucket.earlier => l10n.notificationsGroupEarlier,
  };
}

/// Consecutive notifications that share a [bucket].
class NotificationDayGroup {
  const NotificationDayGroup(this.bucket, this.items);

  final NotificationDayBucket bucket;
  final List<AppNotification> items;
}

/// Calendar-day bucket of [createdAt] relative to [now], both read in the
/// device's local time zone.
NotificationDayBucket notificationDayBucket(DateTime createdAt, DateTime now) {
  final local = createdAt.toLocal();
  final localNow = now.toLocal();
  // Compare calendar dates, not elapsed time: local midnights are 23 or 25
  // hours apart across a DST change, which `inDays` would miscount.
  final today = DateTime.utc(localNow.year, localNow.month, localNow.day);
  final day = DateTime.utc(local.year, local.month, local.day);
  final days = today.difference(day).inDays;
  if (days <= 0) return NotificationDayBucket.today;
  if (days == 1) return NotificationDayBucket.yesterday;
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

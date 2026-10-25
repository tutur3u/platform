import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/features/notifications/widgets/notification_day_groups.dart';

AppNotification _at(String id, DateTime createdAt) => AppNotification(
  id: id,
  userId: 'synthetic-user',
  type: 'system',
  title: id,
  data: const {},
  createdAt: createdAt,
);

void main() {
  final now = DateTime(2026, 10, 25, 9, 30);

  test('buckets by calendar day, not by elapsed hours', () {
    expect(
      notificationDayBucket(DateTime(2026, 10, 25, 0, 5), now),
      NotificationDayBucket.today,
    );
    expect(
      notificationDayBucket(DateTime(2026, 10, 24, 23, 59), now),
      NotificationDayBucket.yesterday,
    );
    expect(
      notificationDayBucket(DateTime(2026, 10, 19, 8), now),
      NotificationDayBucket.lastWeek,
    );
    expect(
      notificationDayBucket(DateTime(2026, 10, 18, 23), now),
      NotificationDayBucket.earlier,
    );
    // Clock skew: a slightly future timestamp still reads as today.
    expect(
      notificationDayBucket(DateTime(2026, 10, 26, 1), now),
      NotificationDayBucket.today,
    );
  });

  test('keeps feed order and starts a new run for out-of-order items', () {
    final groups = groupNotificationsByDay([
      _at('a', DateTime(2026, 10, 25, 9)),
      _at('b', DateTime(2026, 10, 25, 8)),
      _at('c', DateTime(2026, 10, 24, 20)),
      _at('d', DateTime(2026, 10, 2)),
      _at('e', DateTime(2026, 10, 25, 7)),
    ], now);

    expect(
      [for (final group in groups) group.bucket],
      [
        NotificationDayBucket.today,
        NotificationDayBucket.yesterday,
        NotificationDayBucket.earlier,
        NotificationDayBucket.today,
      ],
    );
    expect(
      [
        for (final group in groups) [for (final item in group.items) item.id],
      ],
      [
        ['a', 'b'],
        ['c'],
        ['d'],
        ['e'],
      ],
    );
    expect(groupNotificationsByDay(const [], now), isEmpty);
  });

  // Local midnights are 23 or 25 hours apart across a DST change, so elapsed
  // time between them miscounts days. These cases only differ from UTC when
  // the suite runs under a DST zone, e.g. `TZ=America/New_York flutter test`.
  test('spring-forward day still counts as one calendar day', () {
    final now = DateTime(2026, 3, 9, 9);
    expect(
      notificationDayBucket(DateTime(2026, 3, 9, 0, 30), now),
      NotificationDayBucket.today,
    );
    expect(
      notificationDayBucket(DateTime(2026, 3, 8, 10), now),
      NotificationDayBucket.yesterday,
    );
    expect(
      notificationDayBucket(DateTime(2026, 3, 7, 10), now),
      NotificationDayBucket.lastWeek,
    );
    expect(
      notificationDayBucket(DateTime(2026, 3, 3, 10), now),
      NotificationDayBucket.lastWeek,
    );
    expect(
      notificationDayBucket(DateTime(2026, 3, 2, 10), now),
      NotificationDayBucket.earlier,
    );
  });

  test('fall-back day still counts as one calendar day', () {
    final now = DateTime(2026, 11, 2, 9);
    expect(
      notificationDayBucket(DateTime(2026, 11, 2, 0, 30), now),
      NotificationDayBucket.today,
    );
    expect(
      notificationDayBucket(DateTime(2026, 11, 1, 23, 30), now),
      NotificationDayBucket.yesterday,
    );
    expect(
      notificationDayBucket(DateTime(2026, 10, 31, 10), now),
      NotificationDayBucket.lastWeek,
    );
    expect(
      notificationDayBucket(DateTime(2026, 10, 27, 10), now),
      NotificationDayBucket.lastWeek,
    );
    expect(
      notificationDayBucket(DateTime(2026, 10, 26, 10), now),
      NotificationDayBucket.earlier,
    );
  });

  test('UTC timestamps bucket by the local calendar day', () {
    final now = DateTime(2026, 3, 9, 9);
    final localYesterday = DateTime(2026, 3, 8, 12);
    expect(
      notificationDayBucket(localYesterday.toUtc(), now),
      NotificationDayBucket.yesterday,
    );
  });
}

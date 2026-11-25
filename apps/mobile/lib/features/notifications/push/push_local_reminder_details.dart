part of 'push_notification_service.dart';

@visibleForTesting
NotificationDetails localReminderDetails(
  String title,
  String body, {
  required bool grouped,
}) => NotificationDetails(
  android: AndroidNotificationDetails(
    'tuturuuu_reminders',
    'Reminders',
    channelDescription: 'Task and calendar reminders',
    importance: Importance.high,
    priority: Priority.high,
    styleInformation: grouped
        ? BigTextStyleInformation(body, contentTitle: title, summaryText: title)
        : null,
  ),
  iOS: const DarwinNotificationDetails(),
);

import 'package:mobile/features/notifications/push/push_notification_service.dart';

/// Schedules the one local notification for the end of the running phase.
abstract interface class PomodoroNotifier {
  Future<void> schedule({
    required DateTime at,
    required String title,
    required String body,
    String? wsId,
    String? userId,
  });

  Future<void> cancel();
}

/// [PomodoroNotifier] on the device's local notifications. Tapping the
/// notification opens the Timer. Failures (for example, notifications
/// turned off) never block the countdown.
class LocalPomodoroNotifier implements PomodoroNotifier {
  const LocalPomodoroNotifier();

  /// Fixed so a newer phase replaces the pending notification.
  static const notificationId = 7310001;

  @override
  Future<void> schedule({
    required DateTime at,
    required String title,
    required String body,
    String? wsId,
    String? userId,
  }) async {
    try {
      await PushNotificationService.instance.scheduleLocalReminder(
        id: notificationId,
        scheduledAt: at,
        title: title,
        body: body,
        request: PushNavigationRequest(
          notificationId: 'pomodoro',
          openTarget: 'timer',
          wsId: wsId,
          userId: userId,
        ),
      );
    } on Exception {
      // The in-app countdown still ends the phase.
    }
  }

  @override
  Future<void> cancel() async {
    try {
      await PushNotificationService.instance.cancelLocalReminder(
        notificationId,
      );
    } on Exception {
      // Nothing scheduled, or notifications unavailable.
    }
  }
}

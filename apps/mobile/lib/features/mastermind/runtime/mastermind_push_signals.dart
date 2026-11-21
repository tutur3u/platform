import 'package:mobile/features/notifications/push/push_notification_service.dart';

/// One event per Mastermind push received in the foreground or tapped, such
/// as `decision.awaiting`: the fleet snapshot on screen is behind.
Stream<void> mastermindPushSignals(PushNotificationService service) => service
    .events
    .where(
      (event) =>
          event.type != PushNotificationEventType.archived &&
          event.request.openTarget == 'mastermind',
    )
    .map((_) {});

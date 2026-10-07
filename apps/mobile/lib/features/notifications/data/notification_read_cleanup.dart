import 'package:mobile/features/notifications/push/delivered_inbox_notifications.dart';

/// Acceptance may be a durable offline intent, not server confirmation.
enum NotificationReadResult {
  notAdmitted,
  accepted,
  acceptedScopeChanged,
  acceptedCleanupUnavailable,
  acceptedRefreshUnavailable,
}

/// Capture delivered items before reading. Never cancel pending reminders.
Future<NotificationReadResult> readWithDeliveredCleanup({
  required String? actor,
  required bool Function() isCurrent,
  required Future<void> Function() read,
  String? workspaceId,
  String? notificationId,
  bool dismiss = true,
  DeliveredInboxNotifications? notifications,
}) async {
  final bridge = notifications ?? DeliveredInboxNotifications.instance;
  if (actor == null || !isCurrent()) return NotificationReadResult.notAdmitted;
  final session = bridge.captureSession(actor);
  if (session == null) return NotificationReadResult.notAdmitted;
  bool current() => isCurrent() && bridge.isCurrentSession(session);
  DeliveredInboxSnapshot? snapshot;
  var cleanupUnavailable = false;
  if (dismiss && bridge.supportsCleanup) {
    try {
      snapshot = await bridge.snapshot(
        actor: actor,
        workspaceId: workspaceId,
        notificationId: notificationId,
      );
    } on Object {
      cleanupUnavailable = true;
    }
  }
  Future<void> discard() async {
    final captured = snapshot;
    if (captured == null) return;
    try {
      await bridge.discardSnapshot(captured);
    } on Object {
      // Session rotation already evicts tokens; failure never changes the read.
    }
  }

  if (!current()) {
    await discard();
    return NotificationReadResult.notAdmitted;
  }
  try {
    await read();
  } on Object {
    await discard();
    rethrow;
  }
  if (!current()) {
    await discard();
    return NotificationReadResult.acceptedScopeChanged;
  }
  final captured = snapshot;
  if (captured != null) {
    try {
      await bridge.dismissSnapshot(captured);
    } on Object {
      cleanupUnavailable = true;
      await discard();
    }
  }
  if (!current()) return NotificationReadResult.acceptedScopeChanged;
  return cleanupUnavailable
      ? NotificationReadResult.acceptedCleanupUnavailable
      : NotificationReadResult.accepted;
}

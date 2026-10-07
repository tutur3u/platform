import 'package:flutter/material.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/data/notification_read_cleanup.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Read acceptance is retained; warn without encouraging another read mutation.
void showNotificationReadFeedback(
  BuildContext context,
  NotificationReadResult result, {
  required bool Function() isCurrent,
}) {
  if (!context.mounted || !isCurrent()) return;
  final message = switch (result) {
    NotificationReadResult.acceptedCleanupUnavailable =>
      context.l10n.notificationsReadCleanupUnavailable,
    NotificationReadResult.acceptedRefreshUnavailable =>
      context.l10n.notificationsReadRefreshUnavailable,
    _ => null,
  };
  if (message == null) return;
  final toastContext = Navigator.of(context, rootNavigator: true).context;
  if (!toastContext.mounted) return;
  shad.showToast(
    context: toastContext,
    builder: (context, overlay) => shad.Alert(content: Text(message)),
  );
}

/// Scope-safe feedback for the same accepted read action used by both surfaces.
Future<void> performNotificationRead(
  BuildContext context,
  NotificationsCubit cubit,
  Future<NotificationReadResult> Function() action,
) async {
  final current = cubit.captureReadFeedbackGuard();
  try {
    final result = await action();
    if (!context.mounted) return;
    showNotificationReadFeedback(context, result, isCurrent: current);
  } on Object {
    if (!context.mounted || !current()) return;
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => shad.Alert.destructive(
        content: Text(context.l10n.notificationsReadError),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/features/notifications/notification_display_copy.dart';
import 'package:mobile/features/notifications/widgets/notification_row.dart';
import 'package:mobile/features/notifications/widgets/notifications_relative_time.dart';
import 'package:mobile/l10n/l10n.dart';

/// Shows a notification that has no screen to open, or whose target is gone,
/// with its full text. [targetUnavailable] adds a note that the linked item
/// cannot be opened.
Future<void> showNotificationDetailSheet(
  BuildContext context,
  AppNotification notification, {
  required bool targetUnavailable,
}) {
  return showAppSheet<void>(
    context: context,
    builder: (context) => NotificationDetailSheet(
      notification: notification,
      targetUnavailable: targetUnavailable,
    ),
  );
}

class NotificationDetailSheet extends StatelessWidget {
  const NotificationDetailSheet({
    required this.notification,
    required this.targetUnavailable,
    super.key,
  });

  final AppNotification notification;
  final bool targetUnavailable;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final display = notificationDisplayCopy(notification, l10n);
    final workspace = notification.workspaceName;
    final meta = [
      formatNotificationRelativeTime(context, notification.createdAt),
      if (workspace != null) workspace,
    ].join(' · ');
    return AppSheetScaffold(
      title: display.title,
      icon: notificationTypeIcon(notification.type),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            meta,
            style: tokens.typography.small.copyWith(color: c.mutedForeground),
          ),
          if (display.body case final String body) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              body,
              style: tokens.typography.base.copyWith(color: c.foreground),
            ),
          ],
          if (targetUnavailable) ...[
            const SizedBox(height: AppSpacing.lg),
            AppStateMessage.inline(
              key: const ValueKey('notification-target-unavailable'),
              icon: LucideIcons.circleSlash,
              title: l10n.notificationsTargetUnavailable,
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
        ],
      ),
    );
  }
}

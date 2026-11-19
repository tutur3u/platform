import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/features/notifications/notification_display_copy.dart';
import 'package:mobile/features/notifications/widgets/notification_row.dart';
import 'package:mobile/features/notifications/widgets/notifications_relative_time.dart';
import 'package:mobile/l10n/l10n.dart';

/// Leading tone tile size of an inbox row.
const double notificationInboxLeadingSize = 40;

/// One inbox notification: a source tile, title, one-line body, relative
/// time and an unread dot. Tapping opens it; swiping toward the end edge
/// toggles read. Open workspace invites add inline Accept and Decline.
class NotificationInboxRow extends StatelessWidget {
  const NotificationInboxRow({
    required this.notification,
    required this.isPending,
    required this.onOpen,
    required this.onToggleRead,
    this.onAcceptInvite,
    this.onDeclineInvite,
    this.now,
    super.key,
  });

  final AppNotification notification;
  final bool isPending;
  final VoidCallback onOpen;
  final VoidCallback onToggleRead;
  final VoidCallback? onAcceptInvite;
  final VoidCallback? onDeclineInvite;

  /// Clock for the relative time; the device clock when null.
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final unread = notification.isUnread;
    final display = notificationDisplayCopy(notification, l10n);
    final hasInviteActions = onAcceptInvite != null || onDeclineInvite != null;
    final unreadColor = SorbetTokens.maybeOf(context)?.hues.blue.ink ?? c.info;

    final content = Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppLayout.rowHorizontalPadding,
        vertical: AppSpacing.md,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppIconTile(
            icon: notificationTypeIcon(notification.type),
            tone: notificationTypeTone(notification.type),
            size: notificationInboxLeadingSize,
          ),
          const SizedBox(width: AppLayout.rowLeadingGap),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        display.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: tokens.typography.base.copyWith(
                          color: c.foreground,
                          fontSize: 15,
                          height: 20 / 15,
                          fontWeight: unread
                              ? FontWeight.w600
                              : FontWeight.w400,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        formatNotificationRelativeTime(
                          context,
                          notification.createdAt,
                          now: now,
                        ),
                        style: tokens.typography.xSmall.copyWith(
                          color: unread ? unreadColor : c.mutedForeground,
                          fontWeight: unread
                              ? FontWeight.w600
                              : FontWeight.w400,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                  ],
                ),
                if (display.body case final String body) ...[
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    body,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: tokens.typography.small.copyWith(
                      color: c.mutedForeground,
                    ),
                  ),
                ],
                if (hasInviteActions) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Row(
                    children: [
                      AppButton.primary(
                        size: AppButtonSize.small,
                        onPressed: isPending ? null : onAcceptInvite,
                        child: Text(l10n.notificationsAcceptInvite),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      AppButton.outline(
                        size: AppButtonSize.small,
                        onPressed: isPending ? null : onDeclineInvite,
                        child: Text(l10n.notificationsDeclineInvite),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          SizedBox(
            width: AppSpacing.lg,
            child: Padding(
              padding: const EdgeInsets.only(top: 6),
              child: unread
                  ? Align(
                      alignment: AlignmentDirectional.topEnd,
                      child: Semantics(
                        label: l10n.notificationsUnreadLabel,
                        child: Container(
                          key: const ValueKey('notification-unread-dot'),
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: unreadColor,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                    )
                  : null,
            ),
          ),
        ],
      ),
    );

    return AppSwipeActions(
      enabled: !isPending,
      leading: AppSwipeAction(
        key: ValueKey('notification-swipe-${notification.id}'),
        label: unread
            ? l10n.notificationsMarkRead
            : l10n.notificationsMarkUnread,
        icon: unread ? LucideIcons.checkCheck : LucideIcons.mailOpen,
        tone: AppTone.info,
        onPressed: onToggleRead,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          key: ValueKey('notification-row-${notification.id}'),
          onTap: isPending ? null : onOpen,
          child: content,
        ),
      ),
    );
  }
}

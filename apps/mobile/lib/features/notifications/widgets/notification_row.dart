import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/features/notifications/notification_display_copy.dart';
import 'package:mobile/features/notifications/widgets/notifications_relative_time.dart';
import 'package:mobile/l10n/l10n.dart';

/// Leading tile size of a notification row.
const double notificationLeadingSize = 40;

/// Divider inset that aligns with the text column of [NotificationRow].
const double notificationDividerInset =
    AppLayout.rowHorizontalPadding +
    notificationLeadingSize +
    AppLayout.rowLeadingGap;

/// One notification inside a grouped card: a type tile (with an unread dot),
/// title, body, workspace and age, plus invite actions or an open hint and a
/// read toggle.
class NotificationRow extends StatelessWidget {
  const NotificationRow({
    required this.notification,
    required this.isPending,
    required this.openLabel,
    required this.onToggleRead,
    this.onAcceptInvite,
    this.onDeclineInvite,
    this.onOpen,
    super.key,
  });

  final AppNotification notification;
  final bool isPending;
  final String? openLabel;
  final VoidCallback onToggleRead;
  final VoidCallback? onAcceptInvite;
  final VoidCallback? onDeclineInvite;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final l10n = context.l10n;
    final unread = notification.isUnread;
    final hasPrimaryAction = onAcceptInvite != null || onDeclineInvite != null;
    final display = notificationDisplayCopy(notification, l10n);
    final meta = [
      if (notification.workspaceName case final name? when name.isNotEmpty)
        name,
      formatNotificationRelativeTime(context, notification.createdAt),
    ].join(' · ');

    final content = Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(
        AppLayout.rowHorizontalPadding,
        AppSpacing.md + AppSpacing.xxs,
        AppSpacing.xs,
        AppSpacing.md + AppSpacing.xxs,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppIconTile(
            icon: notificationTypeIcon(notification.type),
            tone: notificationTypeTone(notification.type),
            size: notificationLeadingSize,
            badge: unread,
          ),
          const SizedBox(width: AppLayout.rowLeadingGap),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  display.title,
                  style: tokens.typography.base.copyWith(
                    color: c.foreground,
                    fontWeight: unread ? FontWeight.w600 : FontWeight.w500,
                    height: 1.3,
                  ),
                ),
                if (display.body case final String body) ...[
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    body,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: tokens.typography.small.copyWith(
                      color: c.mutedForeground,
                      height: 1.4,
                    ),
                  ),
                ],
                const SizedBox(height: AppSpacing.xs + AppSpacing.xxs),
                Text(
                  meta,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: tokens.typography.xSmall.copyWith(
                    color: c.mutedForeground,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (notification.type == 'workspace_invite' &&
                    notification.actionTaken != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  _InviteStatusBadge(actionTaken: notification.actionTaken!),
                ] else if (hasPrimaryAction) ...[
                  const SizedBox(height: AppSpacing.md),
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      AppButton.outline(
                        size: AppButtonSize.small,
                        onPressed: isPending ? null : onDeclineInvite,
                        child: Text(l10n.notificationsDeclineInvite),
                      ),
                      AppButton.primary(
                        size: AppButtonSize.small,
                        onPressed: isPending ? null : onAcceptInvite,
                        child: Text(l10n.notificationsAcceptInvite),
                      ),
                    ],
                  ),
                ] else if (onOpen != null && openLabel != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        openLabel!,
                        style: tokens.typography.small.copyWith(
                          color: c.primary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Icon(AppIcons.forward, size: 16, color: c.primary),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.xs),
          if (isPending)
            const SizedBox.square(
              dimension: 44,
              child: AppLoadingIndicator.inline(),
            )
          else
            AppIconButton(
              onPressed: onToggleRead,
              tooltip: unread
                  ? l10n.notificationsMarkRead
                  : l10n.notificationsMarkUnread,
              icon: Icon(unread ? LucideIcons.check : LucideIcons.circleDot),
            ),
        ],
      ),
    );

    final tap = isPending || hasPrimaryAction ? null : onOpen;
    if (tap == null) return content;
    return InkWell(onTap: tap, child: content);
  }
}

class _InviteStatusBadge extends StatelessWidget {
  const _InviteStatusBadge({required this.actionTaken});

  final String actionTaken;

  @override
  Widget build(BuildContext context) {
    final accepted = actionTaken == 'accepted';
    return AppBadge(
      variant: accepted ? AppBadgeVariant.success : AppBadgeVariant.secondary,
      leading: Icon(accepted ? LucideIcons.check : LucideIcons.x),
      child: Text(
        accepted
            ? context.l10n.notificationsInviteAccepted
            : context.l10n.notificationsInviteDeclined,
      ),
    );
  }
}

/// Theme tone of a notification type's tile.
AppTone notificationTypeTone(String type) => switch (type) {
  'workspace_invite' => AppTone.warning,
  'security_alert' ||
  'report_rejected' ||
  'post_rejected' => AppTone.destructive,
  'task_completed' || 'report_approved' || 'post_approved' => AppTone.success,
  'task_mention' || 'mail_received' => AppTone.info,
  _ => AppTone.primary,
};

/// Line icon of a notification type.
IconData notificationTypeIcon(String type) => switch (type) {
  'workspace_invite' => LucideIcons.userPlus,
  'mail_received' => LucideIcons.mail,
  'security_alert' => LucideIcons.shieldAlert,
  'system_announcement' => LucideIcons.megaphone,
  'task_completed' => LucideIcons.circleCheck,
  'task_mention' => LucideIcons.atSign,
  'task_moved' => LucideIcons.arrowRightLeft,
  'task_assigned' => LucideIcons.userCheck,
  'report_approved' || 'post_approved' => LucideIcons.circleCheck,
  'report_rejected' || 'post_rejected' => LucideIcons.circleX,
  _ => LucideIcons.bell,
};

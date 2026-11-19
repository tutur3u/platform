import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/data/archive_opened_notification.dart';
import 'package:mobile/features/notifications/data/notification_read_cleanup.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/notifications/widgets/notification_detail_sheet.dart';
import 'package:mobile/features/notifications/widgets/notification_open_plan.dart';
import 'package:mobile/features/notifications/widgets/notification_read_feedback.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// Inbox mutations shared by the rows and the page's top-bar action.
///
/// Reads update the rows and unread count before the server confirms, then
/// tell other unread badges to refresh.
class NotificationInboxActions {
  const NotificationInboxActions({
    required this.cubit,
    required this.workspaceCubit,
    required this.navigate,
    this.archiveOpened = archiveOpenedNotification,
  });

  final NotificationsCubit cubit;
  final WorkspaceCubit workspaceCubit;
  final void Function(String location) navigate;
  final Future<void> Function(String notificationId) archiveOpened;

  /// Marks [notification] read and opens its target, or its details when the
  /// target cannot be opened.
  Future<void> open(BuildContext context, AppNotification notification) async {
    if (notification.isUnread) {
      cubit.applyLocalRead(notification.id, read: true);
      // Mail marks its own message read when the thread opens.
      if (notification.entityType != 'mail_message') {
        unawaited(archiveOpened(notification.id));
      }
    }
    final plan = planNotificationOpen(
      notification,
      workspaces: workspaceCubit.state.workspaces,
      currentWorkspaceId: workspaceCubit.state.currentWorkspace?.id,
    );
    switch (plan) {
      case NotificationShowDetails(:final targetUnavailable):
        await showNotificationDetailSheet(
          context,
          notification,
          targetUnavailable: targetUnavailable,
        );
      case NotificationNavigate(:final location, :final switchTo):
        if (switchTo != null) await workspaceCubit.selectWorkspace(switchTo);
        if (!context.mounted) return;
        navigate(location);
    }
  }

  /// Toggles read with an Undo toast that restores the previous state.
  Future<void> toggleRead(
    BuildContext context,
    AppNotification notification,
  ) async {
    final l10n = context.l10n;
    final toggled = notification.copyWith(
      readAt: notification.isUnread ? DateTime.now() : null,
    );
    final write = performNotificationRead(
      context,
      cubit,
      () => cubit.toggleRead(notification),
    );
    showAppToast(
      context,
      message: notification.isUnread
          ? l10n.notificationsMarkedRead
          : l10n.notificationsMarkedUnread,
      actionLabel: l10n.notificationsUndo,
      onAction: () => unawaited(_undo(context, write, toggled)),
    );
    await write;
    PushNotificationService.instance.notifyArchiveChanged();
  }

  /// Waits for the original write, then reverses it from [toggled].
  Future<void> _undo(
    BuildContext context,
    Future<void> write,
    AppNotification toggled,
  ) async {
    await write;
    if (!context.mounted) return;
    await _read(context, () => cubit.toggleRead(toggled));
  }

  Future<void> markAllRead(BuildContext context) async {
    await _read(context, cubit.markAllRead);
  }

  Future<void> _read(
    BuildContext context,
    Future<NotificationReadResult> Function() action,
  ) async {
    await performNotificationRead(context, cubit, action);
    PushNotificationService.instance.notifyArchiveChanged();
  }

  Future<void> acceptInvite(
    BuildContext context,
    AppNotification notification,
  ) async {
    final l10n = context.l10n;
    try {
      await cubit.acceptInvite(notification);
      await workspaceCubit.loadWorkspaces(forceRefresh: true);
      if (!context.mounted) return;
      showAppToast(context, message: l10n.notificationsInviteAccepted);
    } on Exception {
      if (!context.mounted) return;
      showAppToast(
        context,
        message: l10n.notificationsInviteActionError,
        variant: AppAlertVariant.destructive,
      );
    }
  }

  Future<void> declineInvite(
    BuildContext context,
    AppNotification notification,
  ) async {
    final l10n = context.l10n;
    try {
      await cubit.declineInvite(notification);
      if (!context.mounted) return;
      showAppToast(context, message: l10n.notificationsInviteDeclined);
    } on Exception {
      if (!context.mounted) return;
      showAppToast(
        context,
        message: l10n.notificationsInviteActionError,
        variant: AppAlertVariant.destructive,
      );
    }
  }
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<void> showNotificationsSheet({
  required BuildContext context,
  required NotificationsCubit notificationsCubit,
}) {
  return showAdaptiveDrawer(
    context: context,
    maxDialogWidth: 460,
    builder: (sheetContext) => BlocProvider.value(
      value: notificationsCubit,
      child: _NotificationsSheet(parentContext: context),
    ),
  );
}

class _NotificationsSheet extends StatefulWidget {
  const _NotificationsSheet({
    required this.parentContext,
  });

  final BuildContext parentContext;

  @override
  State<_NotificationsSheet> createState() => _NotificationsSheetState();
}

class _NotificationsSheetState extends State<_NotificationsSheet> {
  NotificationsTab _selectedTab = NotificationsTab.inbox;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      final notificationsCubit = context.read<NotificationsCubit>();
      unawaited(notificationsCubit.refreshUnreadCount());
      unawaited(notificationsCubit.loadTab(_selectedTab, refresh: true));
    });
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);
    final maxHeight =
        MediaQuery.sizeOf(context).height * (context.isCompact ? 0.82 : 0.76);

    return BlocBuilder<NotificationsCubit, NotificationsState>(
      builder: (context, state) {
        final feed = state.feedFor(_selectedTab);

        return Material(
          color: Colors.transparent,
          child: Container(
            constraints: BoxConstraints(maxHeight: maxHeight),
            decoration: BoxDecoration(
              color: colorScheme.surface,
              borderRadius: BorderRadius.circular(context.isCompact ? 0 : 22),
              border: context.isCompact
                  ? null
                  : Border.all(
                      color: colorScheme.outlineVariant.withValues(alpha: 0.22),
                    ),
              boxShadow: context.isCompact
                  ? null
                  : [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.12),
                        blurRadius: 28,
                        offset: const Offset(0, 14),
                      ),
                    ],
            ),
            child: SafeArea(
              top: !context.isCompact,
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  18,
                  context.isCompact ? 10 : 18,
                  18,
                  context.isCompact ? 18 : 16,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: colorScheme.primary.withValues(alpha: 0.10),
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Icon(
                            Icons.notifications_none_rounded,
                            size: 20,
                            color: colorScheme.primary,
                          ),
                        ),
                        const shad.Gap(12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                context.l10n.notificationsTitle,
                                style: theme.typography.large.copyWith(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const shad.Gap(2),
                              Text(
                                context.l10n.notificationsSubtitle(
                                  state.unreadCount,
                                ),
                                style: theme.typography.small.copyWith(
                                  color: colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const shad.Gap(16),
                    Builder(
                      builder: (context) {
                        final inboxLabel = state.unreadCount > 0
                            ? '${context.l10n.notificationsInbox} '
                                  '(${state.unreadCount})'
                            : context.l10n.notificationsInbox;
                        return SegmentedButton<NotificationsTab>(
                          showSelectedIcon: false,
                          segments: [
                            ButtonSegment(
                              value: NotificationsTab.inbox,
                              label: Text(inboxLabel),
                            ),
                            ButtonSegment(
                              value: NotificationsTab.archive,
                              label: Text(context.l10n.notificationsArchive),
                            ),
                          ],
                          selected: {_selectedTab},
                          onSelectionChanged: (selection) {
                            final tab = selection.firstOrNull;
                            if (tab == null) {
                              return;
                            }
                            setState(() {
                              _selectedTab = tab;
                            });
                            unawaited(
                              context.read<NotificationsCubit>().loadTab(tab),
                            );
                          },
                        );
                      },
                    ),
                    const shad.Gap(16),
                    _NotificationsSectionHeader(
                      title: _selectedTab == NotificationsTab.inbox
                          ? context.l10n.notificationsInbox
                          : context.l10n.notificationsArchive,
                      action:
                          _selectedTab == NotificationsTab.inbox &&
                              state.unreadCount > 0
                          ? state.isArchivingAll
                                ? SizedBox(
                                    width: 14,
                                    height: 14,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: colorScheme.primary,
                                    ),
                                  )
                                : Text(
                                    context.l10n.notificationsArchiveAll,
                                    style: theme.typography.small.copyWith(
                                      color: colorScheme.primary,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  )
                          : null,
                      onAction:
                          _selectedTab == NotificationsTab.inbox &&
                              state.unreadCount > 0 &&
                              !state.isArchivingAll
                          ? () => unawaited(_archiveAll(context))
                          : null,
                    ),
                    const shad.Gap(10),
                    Expanded(
                      child: _NotificationsList(
                        key: ValueKey(_selectedTab),
                        tab: _selectedTab,
                        feed: feed,
                        onRefresh: () => context
                            .read<NotificationsCubit>()
                            .loadTab(_selectedTab, refresh: true),
                        onLoadMore: () =>
                            context.read<NotificationsCubit>().loadMore(
                              _selectedTab,
                            ),
                        itemBuilder: (notification) => _NotificationTile(
                          notification: notification,
                          isPending: state.isPending(notification.id),
                          onToggleRead: () => unawaited(
                            context.read<NotificationsCubit>().toggleRead(
                              notification,
                            ),
                          ),
                          onAcceptInvite:
                              notification.type == 'workspace_invite' &&
                                  notification.actionTaken == null
                              ? () => unawaited(
                                  _acceptInvite(context, notification),
                                )
                              : null,
                          onDeclineInvite:
                              notification.type == 'workspace_invite' &&
                                  notification.actionTaken == null
                              ? () => unawaited(
                                  _declineInvite(context, notification),
                                )
                              : null,
                          onOpen: _canOpenNotification(notification)
                              ? () => unawaited(
                                  _openNotification(context, notification),
                                )
                              : null,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  bool _canOpenNotification(AppNotification notification) {
    return notification.entityType == 'task' &&
        (notification.entityId?.isNotEmpty ?? false) &&
        (notification.boardId?.isNotEmpty ?? false);
  }

  Future<void> _archiveAll(BuildContext context) async {
    final notificationsCubit = context.read<NotificationsCubit>();
    final archiveAllError = context.l10n.notificationsArchiveAllError;
    try {
      await notificationsCubit.markAllRead();
    } on Exception {
      if (!context.mounted) {
        return;
      }
      _showToast(context, archiveAllError, destructive: true);
    }
  }

  Future<void> _acceptInvite(
    BuildContext context,
    AppNotification notification,
  ) async {
    final notificationsCubit = context.read<NotificationsCubit>();
    final inviteAccepted = context.l10n.notificationsInviteAccepted;
    final inviteActionError = context.l10n.notificationsInviteActionError;
    final workspaceCubit = widget.parentContext.read<WorkspaceCubit>();
    try {
      await notificationsCubit.acceptInvite(notification);
      if (!context.mounted) {
        return;
      }
      await workspaceCubit.loadWorkspaces();
      if (!context.mounted) {
        return;
      }
      _showToast(context, inviteAccepted);
    } on Exception {
      if (!context.mounted) {
        return;
      }
      _showToast(context, inviteActionError, destructive: true);
    }
  }

  Future<void> _declineInvite(
    BuildContext context,
    AppNotification notification,
  ) async {
    final notificationsCubit = context.read<NotificationsCubit>();
    final inviteDeclined = context.l10n.notificationsInviteDeclined;
    final inviteActionError = context.l10n.notificationsInviteActionError;
    try {
      await notificationsCubit.declineInvite(notification);
      if (!context.mounted) {
        return;
      }
      _showToast(context, inviteDeclined);
    } on Exception {
      if (!context.mounted) {
        return;
      }
      _showToast(context, inviteActionError, destructive: true);
    }
  }

  Future<void> _openNotification(
    BuildContext context,
    AppNotification notification,
  ) async {
    final entityId = notification.entityId;
    final boardId = notification.boardId;
    if (entityId == null || boardId == null) {
      return;
    }

    final workspaceCubit = widget.parentContext.read<WorkspaceCubit>();
    final targetWorkspaceId = notification.workspaceId;
    if (targetWorkspaceId != null &&
        workspaceCubit.state.currentWorkspace?.id != targetWorkspaceId) {
      final unsupportedMessage = context.l10n.notificationsOpenUnsupported;
      final targetWorkspace = workspaceCubit.state.workspaces
          .where((workspace) => workspace.id == targetWorkspaceId)
          .firstOrNull;
      if (targetWorkspace == null) {
        _showToast(context, unsupportedMessage, destructive: true);
        return;
      }
      await workspaceCubit.selectWorkspace(targetWorkspace);
    }

    if (!context.mounted) {
      return;
    }
    await dismissAdaptiveDrawerOverlay(context);
    if (!widget.parentContext.mounted) {
      return;
    }

    widget.parentContext.go(
      '${Routes.taskBoardDetailPath(boardId)}?taskId=$entityId',
    );
  }

  void _showToast(
    BuildContext context,
    String title, {
    bool destructive = false,
  }) {
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) {
      return;
    }

    shad.showToast(
      context: toastContext,
      builder: (context, overlay) => destructive
          ? shad.Alert.destructive(content: Text(title))
          : shad.Alert(content: Text(title)),
    );
  }
}

class _NotificationsList extends StatefulWidget {
  const _NotificationsList({
    required this.tab,
    required this.feed,
    required this.onRefresh,
    required this.onLoadMore,
    required this.itemBuilder,
    super.key,
  });

  final NotificationsTab tab;
  final NotificationFeedState feed;
  final Future<void> Function() onRefresh;
  final Future<void> Function() onLoadMore;
  final Widget Function(AppNotification notification) itemBuilder;

  @override
  State<_NotificationsList> createState() => _NotificationsListState();
}

class _NotificationsListState extends State<_NotificationsList> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) {
      return;
    }

    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 220) {
      unawaited(widget.onLoadMore());
    }
  }

  @override
  Widget build(BuildContext context) {
    final feed = widget.feed;
    Widget child;
    if (feed.status == NotificationFeedStatus.loading && !feed.hasLoadedOnce) {
      child = ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(
            height: 320,
            child: Center(child: shad.CircularProgressIndicator()),
          ),
        ],
      );
    } else if (feed.status == NotificationFeedStatus.error &&
        !feed.hasLoadedOnce) {
      child = ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(
            height: 320,
            child: _NotificationsEmptyState(
              title: context.l10n.notificationsLoadErrorTitle,
              message: context.l10n.notificationsLoadErrorMessage,
              actionLabel: context.l10n.commonRetry,
              onAction: widget.onRefresh,
            ),
          ),
        ],
      );
    } else if (feed.items.isEmpty) {
      child = ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(
            height: 320,
            child: _NotificationsEmptyState(
              title: widget.tab == NotificationsTab.inbox
                  ? context.l10n.notificationsInboxEmptyTitle
                  : context.l10n.notificationsArchiveEmptyTitle,
              message: widget.tab == NotificationsTab.inbox
                  ? context.l10n.notificationsInboxEmptyMessage
                  : context.l10n.notificationsArchiveEmptyMessage,
            ),
          ),
        ],
      );
    } else {
      child = ListView.separated(
        controller: _scrollController,
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 14),
        physics: const AlwaysScrollableScrollPhysics(),
        itemBuilder: (context, index) {
          if (index >= feed.items.length) {
            return Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 4),
              child: Center(
                child: Text(
                  context.l10n.notificationsLoadingMore,
                  style: shad.Theme.of(context).typography.small.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            );
          }

          return widget.itemBuilder(feed.items[index]);
        },
        separatorBuilder: (context, index) => _NotificationDivider(
          tinted: feed.items[index].isUnread,
        ),
        itemCount: feed.items.length + (feed.isLoadingMore ? 1 : 0),
      );
    }

    return RefreshIndicator(
      onRefresh: widget.onRefresh,
      child: _NotificationsSurface(
        child: child,
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.notification,
    required this.isPending,
    required this.onToggleRead,
    this.onAcceptInvite,
    this.onDeclineInvite,
    this.onOpen,
  });

  final AppNotification notification;
  final bool isPending;
  final VoidCallback onToggleRead;
  final VoidCallback? onAcceptInvite;
  final VoidCallback? onDeclineInvite;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);
    final hasPrimaryAction = onAcceptInvite != null || onDeclineInvite != null;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: isPending || hasPrimaryAction ? null : onOpen,
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: notification.isUnread
                ? colorScheme.primary.withValues(alpha: 0.06)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: _accentColor(context, notification.type).withValues(
                    alpha: 0.12,
                  ),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  _iconForType(notification.type),
                  size: 19,
                  color: _accentColor(context, notification.type),
                ),
              ),
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        if (notification.workspaceName?.isNotEmpty ?? false)
                          Text(
                            notification.workspaceName!,
                            style: theme.typography.xSmall.copyWith(
                              color: colorScheme.primary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        Text(
                          _formatRelativeTime(context, notification.createdAt),
                          style: theme.typography.xSmall.copyWith(
                            color: colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                    const shad.Gap(4),
                    Text(
                      notification.title,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (notification.description?.isNotEmpty ?? false) ...[
                      const shad.Gap(4),
                      Text(
                        notification.description!,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.small.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                    if (notification.type == 'workspace_invite' &&
                        notification.actionTaken != null) ...[
                      const shad.Gap(8),
                      _InviteStatusChip(actionTaken: notification.actionTaken!),
                    ] else if (hasPrimaryAction) ...[
                      const shad.Gap(10),
                      Row(
                        children: [
                          OutlinedButton(
                            onPressed: isPending ? null : onDeclineInvite,
                            child: Text(
                              context.l10n.notificationsDeclineInvite,
                            ),
                          ),
                          const shad.Gap(8),
                          FilledButton(
                            onPressed: isPending ? null : onAcceptInvite,
                            child: Text(context.l10n.notificationsAcceptInvite),
                          ),
                        ],
                      ),
                    ] else if (onOpen != null) ...[
                      const shad.Gap(8),
                      Text(
                        context.l10n.notificationsOpenAction,
                        style: theme.typography.xSmall.copyWith(
                          color: colorScheme.primary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const shad.Gap(8),
              Column(
                children: [
                  IconButton(
                    onPressed: isPending ? null : onToggleRead,
                    icon: isPending
                        ? SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: colorScheme.primary,
                            ),
                          )
                        : Icon(
                            notification.isUnread
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                            size: 18,
                          ),
                    tooltip: notification.isUnread
                        ? context.l10n.notificationsMarkRead
                        : context.l10n.notificationsMarkUnread,
                  ),
                  if (onOpen != null && !hasPrimaryAction)
                    Icon(
                      Icons.chevron_right_rounded,
                      size: 18,
                      color: colorScheme.onSurfaceVariant,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NotificationsSectionHeader extends StatelessWidget {
  const _NotificationsSectionHeader({
    required this.title,
    this.action,
    this.onAction,
  });

  final String title;
  final Widget? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);

    return Row(
      children: [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              title,
              style: theme.typography.small.copyWith(
                color: colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.3,
              ),
            ),
          ),
        ),
        if (action != null)
          TextButton(
            onPressed: onAction,
            child: action!,
          ),
      ],
    );
  }
}

class _NotificationsSurface extends StatelessWidget {
  const _NotificationsSurface({
    required this.child,
  });

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: colorScheme.outlineVariant.withValues(alpha: 0.18),
        ),
      ),
      child: child,
    );
  }
}

class _NotificationDivider extends StatelessWidget {
  const _NotificationDivider({
    required this.tinted,
  });

  final bool tinted;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Padding(
      padding: EdgeInsets.fromLTRB(14, tinted ? 2 : 0, 14, tinted ? 2 : 0),
      child: Divider(
        height: 1,
        color: colorScheme.outlineVariant.withValues(alpha: 0.14),
      ),
    );
  }
}

class _InviteStatusChip extends StatelessWidget {
  const _InviteStatusChip({required this.actionTaken});

  final String actionTaken;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final accepted = actionTaken == 'accepted';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: accepted
            ? Colors.green.withValues(alpha: 0.12)
            : colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        accepted
            ? context.l10n.notificationsInviteAccepted
            : context.l10n.notificationsInviteDeclined,
        style: shad.Theme.of(context).typography.xSmall.copyWith(
          color: accepted
              ? Colors.green.shade700
              : colorScheme.onSurfaceVariant,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _NotificationsEmptyState extends StatelessWidget {
  const _NotificationsEmptyState({
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String message;
  final String? actionLabel;
  final Future<void> Function()? onAction;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Icon(
                Icons.notifications_none_rounded,
                size: 24,
                color: colorScheme.primary,
              ),
            ),
            const shad.Gap(14),
            Text(
              title,
              style: theme.typography.large.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const shad.Gap(6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.typography.small.copyWith(
                color: colorScheme.onSurfaceVariant,
              ),
            ),
            if (actionLabel != null && onAction != null) ...[
              const shad.Gap(14),
              FilledButton(
                onPressed: () => unawaited(onAction!.call()),
                child: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

Color _accentColor(BuildContext context, String type) {
  return switch (type) {
    'workspace_invite' => Colors.orange,
    'security_alert' => Theme.of(context).colorScheme.error,
    'system_announcement' => Theme.of(context).colorScheme.primary,
    'task_completed' || 'report_approved' || 'post_approved' => Colors.green,
    'report_rejected' || 'post_rejected' => Theme.of(context).colorScheme.error,
    'task_mention' => Colors.purple,
    _ => Theme.of(context).colorScheme.primary,
  };
}

IconData _iconForType(String type) {
  return switch (type) {
    'workspace_invite' => Icons.mail_outline_rounded,
    'security_alert' => Icons.shield_outlined,
    'system_announcement' => Icons.campaign_outlined,
    'task_completed' => Icons.check_circle_outline_rounded,
    'task_mention' => Icons.alternate_email_rounded,
    'task_moved' => Icons.compare_arrows_rounded,
    'task_assigned' => Icons.assignment_ind_outlined,
    _ => Icons.notifications_none_rounded,
  };
}

String _formatRelativeTime(BuildContext context, DateTime timestamp) {
  final now = DateTime.now();
  final difference = now.difference(timestamp);
  if (difference.inSeconds < 45) {
    return context.l10n.notificationsJustNow;
  }
  if (difference.inMinutes < 60) {
    return context.l10n.notificationsMinutesAgo(difference.inMinutes);
  }
  if (difference.inHours < 24) {
    return context.l10n.notificationsHoursAgo(difference.inHours);
  }
  if (difference.inDays < 7) {
    return context.l10n.notificationsDaysAgo(difference.inDays);
  }
  return DateFormat.MMMd(
    Localizations.localeOf(context).toLanguageTag(),
  ).format(
    timestamp,
  );
}

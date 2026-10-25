import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/data/archive_opened_notification.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/notifications/widgets/notification_day_groups.dart';
import 'package:mobile/features/notifications/widgets/notification_destination.dart';
import 'package:mobile/features/notifications/widgets/notification_read_feedback.dart';
import 'package:mobile/features/notifications/widgets/notification_row.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:mobile/widgets/staggered_entrance.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'notifications_list.dart';

Future<void> showNotificationsSheet({
  required BuildContext context,
  required NotificationsCubit notificationsCubit,
}) {
  return showAdaptiveDrawer(
    context: context,
    maxDialogWidth: 460,
    builder: (sheetContext) => BlocProvider.value(
      value: notificationsCubit,
      child: NotificationsView(
        parentContext: context,
        pageMode: false,
        onBack: () => dismissAdaptiveDrawerOverlay(sheetContext),
      ),
    ),
  );
}

class NotificationsView extends StatefulWidget {
  const NotificationsView({
    required this.parentContext,
    required this.pageMode,
    this.initialTab = NotificationsTab.inbox,
    this.onBack,
    super.key,
  });

  final BuildContext parentContext;
  final bool pageMode;
  final NotificationsTab initialTab;
  final VoidCallback? onBack;

  @override
  State<NotificationsView> createState() => _NotificationsViewState();
}

class _NotificationsViewState extends State<NotificationsView> {
  late NotificationsTab _selectedTab = widget.initialTab;
  StreamSubscription<PushNotificationEvent>? _pushEventsSubscription;

  @override
  void initState() {
    super.initState();
    _pushEventsSubscription = PushNotificationService.instance.events.listen((
      _,
    ) {
      if (!mounted) {
        return;
      }
      final notificationsCubit = context.read<NotificationsCubit>();
      unawaited(notificationsCubit.refreshUnreadCount());
      unawaited(notificationsCubit.loadTab(_selectedTab, refresh: true));
    });
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
  void didUpdateWidget(covariant NotificationsView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialTab == widget.initialTab ||
        _selectedTab == widget.initialTab) {
      return;
    }
    _selectedTab = widget.initialTab;
    unawaited(context.read<NotificationsCubit>().loadTab(_selectedTab));
  }

  @override
  void dispose() {
    unawaited(_pushEventsSubscription?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context).colorScheme;
    final maxHeight =
        MediaQuery.sizeOf(context).height * (context.isCompact ? 0.82 : 0.76);

    return BlocConsumer<NotificationsCubit, NotificationsState>(
      listenWhen: (previous, current) =>
          previous.scopeWorkspaceId != current.scopeWorkspaceId,
      listener: (context, state) => unawaited(
        context.read<NotificationsCubit>().loadTab(_selectedTab, refresh: true),
      ),
      buildWhen: (previous, current) =>
          previous.scopeWorkspaceId != current.scopeWorkspaceId ||
          !identical(
            previous.feedFor(_selectedTab),
            current.feedFor(_selectedTab),
          ) ||
          !identical(previous.pendingIds, current.pendingIds) ||
          (!widget.pageMode &&
              (previous.unreadCount != current.unreadCount ||
                  previous.isArchivingAll != current.isArchivingAll)),
      builder: (context, state) {
        final feed = state.feedFor(_selectedTab);
        final list = _NotificationsList(
          key: PageStorageKey((_selectedTab, state.scopeWorkspaceId)),
          tab: _selectedTab,
          feed: feed,
          pageMode: widget.pageMode,
          onRefresh: () => context.read<NotificationsCubit>().loadTab(
            _selectedTab,
            refresh: true,
          ),
          onLoadMore: () =>
              context.read<NotificationsCubit>().loadMore(_selectedTab),
          itemBuilder: (notification) => NotificationRow(
            notification: notification,
            isPending: state.isPending(notification.id),
            openLabel: _openActionLabel(context, notification),
            onToggleRead: () => unawaited(
              performNotificationRead(
                context,
                context.read<NotificationsCubit>(),
                () =>
                    context.read<NotificationsCubit>().toggleRead(notification),
              ),
            ),
            onAcceptInvite:
                notification.type == 'workspace_invite' &&
                    notification.actionTaken == null
                ? () => unawaited(_acceptInvite(context, notification))
                : null,
            onDeclineInvite:
                notification.type == 'workspace_invite' &&
                    notification.actionTaken == null
                ? () => unawaited(_declineInvite(context, notification))
                : null,
            onOpen: notificationDestination(notification) != null
                ? () => unawaited(_openNotification(context, notification))
                : null,
          ),
        );

        if (widget.pageMode) return list;

        final content = Padding(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.lg,
            context.isCompact ? AppSpacing.sm : AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.lg,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              StaggeredEntrance(
                replayKey: 'notifications-drawer-header-${state.unreadCount}',
                child: _NotificationsHeaderCard(
                  unreadCount: state.unreadCount,
                  onBack: widget.onBack,
                  pageMode: false,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              StaggeredEntrance(
                replayKey: 'notifications-drawer-tabs-${_selectedTab.name}',
                delay: const Duration(milliseconds: 40),
                child: Builder(
                  builder: (context) {
                    final inboxLabel = state.unreadCount > 0
                        ? '${context.l10n.notificationsInbox} '
                              '(${state.unreadCount})'
                        : context.l10n.notificationsInbox;
                    return Row(
                      children: [
                        if (state.isArchivingAll)
                          const SizedBox.square(
                            dimension: 44,
                            child: Center(
                              child: NovaLoadingIndicator(size: 20),
                            ),
                          )
                        else
                          AppIconButton(
                            tooltip: context.l10n.notificationsArchiveAll,
                            onPressed:
                                _selectedTab == NotificationsTab.inbox &&
                                    state.unreadCount > 0
                                ? () => unawaited(_archiveAll(context))
                                : null,
                            icon: const Icon(LucideIcons.archive),
                          ),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: SegmentedButton<NotificationsTab>(
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
                              if (tab == null) return;
                              setState(() => _selectedTab = tab);
                              unawaited(
                                context.read<NotificationsCubit>().loadTab(tab),
                              );
                            },
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              Expanded(child: list),
            ],
          ),
        );

        return Material(
          color: Colors.transparent,
          child: Container(
            constraints: BoxConstraints(maxHeight: maxHeight),
            decoration: BoxDecoration(
              color: tokens.background,
              borderRadius: BorderRadius.circular(
                context.isCompact ? 0 : AppRadius.card,
              ),
              border: context.isCompact
                  ? null
                  : Border.all(color: tokens.border.withValues(alpha: 0.6)),
              boxShadow: context.isCompact
                  ? null
                  : AppElevation.overlay(tokens),
            ),
            child: SafeArea(top: !context.isCompact, child: content),
          ),
        );
      },
    );
  }

  String? _openActionLabel(BuildContext context, AppNotification notification) {
    return switch (notification.entityType) {
      'task' => context.l10n.notificationsOpenTaskAction,
      'mail_message' => context.l10n.commonOpen,
      'time_tracking_request' => context.l10n.notificationsOpenRequestAction,
      _ => null,
    };
  }

  Future<void> _archiveAll(BuildContext context) {
    final cubit = context.read<NotificationsCubit>();
    return performNotificationRead(context, cubit, cubit.markAllRead);
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
      await workspaceCubit.loadWorkspaces(forceRefresh: true);
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
    final route = notificationDestination(notification);
    if (route == null) {
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
    if (!widget.pageMode) {
      await dismissAdaptiveDrawerOverlay(context);
    }
    if (!widget.parentContext.mounted) {
      return;
    }

    widget.parentContext.go(route);
    if (notification.isUnread && notification.entityType != 'mail_message') {
      unawaited(archiveOpenedNotification(notification.id));
    }
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

class _NotificationsHeaderCard extends StatelessWidget {
  const _NotificationsHeaderCard({
    required this.unreadCount,
    required this.pageMode,
    this.onBack,
  });

  final int unreadCount;
  final bool pageMode;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;

    return Row(
      children: [
        AppIconTile(
          icon: LucideIcons.bell,
          tone: AppTone.primary,
          size: notificationLeadingSize,
          badge: unreadCount > 0,
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                context.l10n.notificationsTitle,
                style: tokens.typography.large.copyWith(
                  color: c.foreground,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                context.l10n.notificationsSubtitle(unreadCount),
                style: tokens.typography.small.copyWith(
                  color: c.mutedForeground,
                ),
              ),
            ],
          ),
        ),
        if (!pageMode && onBack != null)
          AppIconButton(
            onPressed: onBack,
            tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
            icon: const Icon(AppIcons.close),
          ),
      ],
    );
  }
}

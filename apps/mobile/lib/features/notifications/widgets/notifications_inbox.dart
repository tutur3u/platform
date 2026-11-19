import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_sync_refresh.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/push/push_notification_service.dart';
import 'package:mobile/features/notifications/widgets/notification_inbox_actions.dart';
import 'package:mobile/features/notifications/widgets/notification_inbox_row.dart';
import 'package:mobile/features/notifications/widgets/notifications_feed_list.dart';
import 'package:mobile/features/notifications/widgets/notifications_filter_bar.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';

/// The Notifications inbox body: feed filters above a day-grouped feed.
/// Cached rows render at once and refresh on open, on push events and on
/// pull.
class NotificationsInbox extends StatefulWidget {
  const NotificationsInbox({
    required this.actions,
    required this.tab,
    required this.onTabChanged,
    this.now,
    this.isActive = true,
    super.key,
  });

  final NotificationInboxActions actions;
  final NotificationsTab tab;
  final ValueChanged<NotificationsTab> onTabChanged;

  /// Clock used for day grouping; the device clock when null.
  final DateTime? now;
  final bool isActive;

  @override
  State<NotificationsInbox> createState() => _NotificationsInboxState();
}

class _NotificationsInboxState extends State<NotificationsInbox>
    with OfflineSyncRefresh<NotificationsInbox> {
  StreamSubscription<PushNotificationEvent>? _pushEvents;

  NotificationsCubit get _cubit => widget.actions.cubit;

  @override
  void initState() {
    super.initState();
    _pushEvents = PushNotificationService.instance.events.listen(
      (_) => _refresh(),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && widget.isActive) _open();
    });
  }

  @override
  void didUpdateWidget(covariant NotificationsInbox oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!oldWidget.isActive && widget.isActive) _open();
    if (oldWidget.tab != widget.tab) unawaited(_cubit.loadTab(widget.tab));
  }

  @override
  void dispose() {
    unawaited(_pushEvents?.cancel());
    super.dispose();
  }

  void _open() {
    _refresh();
    unawaited(OfflineMutationQueue.instance.syncOnViewOpen('notifications'));
  }

  void _refresh() {
    if (!mounted) return;
    unawaited(_cubit.refreshUnreadCount());
    unawaited(_cubit.loadTab(widget.tab, refresh: true));
  }

  @override
  Future<void> refreshAfterOfflineSync() async {
    if (!widget.isActive) return;
    await _cubit.reconcileAfterSync(widget.tab);
  }

  @override
  Widget build(BuildContext context) {
    final actions = widget.actions;
    return BlocConsumer<NotificationsCubit, NotificationsState>(
      bloc: _cubit,
      listenWhen: (previous, current) =>
          previous.scopeWorkspaceId != current.scopeWorkspaceId,
      listener: (context, state) =>
          unawaited(_cubit.loadTab(widget.tab, refresh: true)),
      buildWhen: (previous, current) =>
          previous.scopeWorkspaceId != current.scopeWorkspaceId ||
          previous.unreadCount != current.unreadCount ||
          !identical(
            previous.feedFor(widget.tab),
            current.feedFor(widget.tab),
          ) ||
          !identical(previous.pendingIds, current.pendingIds),
      builder: (context, state) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(height: floatingShellHeaderInset(context)),
            NotificationsFilterBar(
              selected: widget.tab,
              unreadCount: state.unreadCount,
              onSelected: widget.onTabChanged,
            ),
            Expanded(
              child: ClipRect(
                child: NotificationsFeedList(
                  key: PageStorageKey((widget.tab, state.scopeWorkspaceId)),
                  tab: widget.tab,
                  feed: state.feedFor(widget.tab),
                  now: widget.now,
                  onRefresh: () => _cubit.loadTab(widget.tab, refresh: true),
                  onLoadMore: () => _cubit.loadMore(widget.tab),
                  itemBuilder: (notification) {
                    final openInvite =
                        notification.type == 'workspace_invite' &&
                        notification.actionTaken == null;
                    return NotificationInboxRow(
                      key: ValueKey('notification-${notification.id}'),
                      notification: notification,
                      now: widget.now,
                      isPending: state.isPending(notification.id),
                      onOpen: () =>
                          unawaited(actions.open(context, notification)),
                      onToggleRead: () =>
                          unawaited(actions.toggleRead(context, notification)),
                      onAcceptInvite: openInvite
                          ? () => unawaited(
                              actions.acceptInvite(context, notification),
                            )
                          : null,
                      onDeclineInvite: openInvite
                          ? () => unawaited(
                              actions.declineInvite(context, notification),
                            )
                          : null,
                    );
                  },
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

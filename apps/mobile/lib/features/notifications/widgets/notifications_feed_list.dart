import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/widgets/notification_day_groups.dart';
import 'package:mobile/features/notifications/widgets/notification_day_header.dart';
import 'package:mobile/features/notifications/widgets/notification_inbox_row.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_refresh_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

/// Distance from the end of the feed that starts loading the next page.
const double _loadMoreThreshold = 320;

/// The inbox feed: day groups under sticky Today / Yesterday / Earlier
/// headers, pull to refresh and infinite scroll, with skeleton, empty,
/// offline and error states.
class NotificationsFeedList extends StatefulWidget {
  const NotificationsFeedList({
    required this.tab,
    required this.feed,
    required this.onRefresh,
    required this.onLoadMore,
    required this.itemBuilder,
    this.now,
    super.key,
  });

  final NotificationsTab tab;
  final NotificationFeedState feed;
  final Future<void> Function() onRefresh;
  final Future<void> Function() onLoadMore;
  final Widget Function(AppNotification notification) itemBuilder;

  /// Clock used for day grouping; the device clock when null.
  final DateTime? now;

  @override
  State<NotificationsFeedList> createState() => _NotificationsFeedListState();
}

class _NotificationsFeedListState extends State<NotificationsFeedList> {
  final ScrollController _controller = ScrollController();
  int? _autoLoadedAt;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onScroll);
  }

  @override
  void dispose() {
    _controller
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_controller.hasClients) return;
    final position = _controller.position;
    if (position.pixels >= position.maxScrollExtent - _loadMoreThreshold) {
      unawaited(widget.onLoadMore());
    }
  }

  /// A first page shorter than the viewport never scrolls, so the next page
  /// loads once per item count instead.
  void _scheduleAutoLoad() {
    final feed = widget.feed;
    if (feed.status != NotificationFeedStatus.loaded ||
        !feed.hasMore ||
        feed.isLoadingMore ||
        _autoLoadedAt == feed.items.length) {
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_controller.hasClients) return;
      if (_controller.position.maxScrollExtent > _loadMoreThreshold) return;
      _autoLoadedAt = widget.feed.items.length;
      unawaited(widget.onLoadMore());
    });
  }

  @override
  Widget build(BuildContext context) {
    _scheduleAutoLoad();
    return LayoutBuilder(
      builder: (context, constraints) {
        final insets = AppPageInsets.of(context, width: constraints.maxWidth);
        final horizontal = EdgeInsets.only(
          left: insets.left,
          right: insets.right,
        );
        return MediaQuery.removePadding(
          context: context,
          removeLeft: true,
          removeRight: true,
          removeBottom: true,
          child: NovaRefreshIndicator(
            onRefresh: widget.onRefresh,
            child: CustomScrollView(
              controller: _controller,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                ..._bodySlivers(context, horizontal),
                SliverToBoxAdapter(child: SizedBox(height: insets.bottom)),
              ],
            ),
          ),
        );
      },
    );
  }

  List<Widget> _bodySlivers(BuildContext context, EdgeInsets horizontal) {
    final feed = widget.feed;
    final l10n = context.l10n;
    Widget padded(Widget sliver) =>
        SliverPadding(padding: horizontal, sliver: sliver);
    Widget message(Widget child) => SliverFillRemaining(
      hasScrollBody: false,
      child: Padding(
        padding: horizontal.add(const EdgeInsets.only(bottom: 96)),
        child: Center(child: child),
      ),
    );

    if (!feed.hasLoadedOnce) {
      if (feed.status == NotificationFeedStatus.error) {
        return [
          message(
            AppStateMessage(
              key: const ValueKey('notifications-error'),
              icon: feed.isOffline ? LucideIcons.wifiOff : LucideIcons.cloudOff,
              tone: feed.isOffline ? AppTone.neutral : AppTone.destructive,
              illustration: const AppIllustration(AppIllustrationKind.offline),
              title: feed.isOffline
                  ? l10n.notificationsOfflineTitle
                  : l10n.notificationsLoadErrorTitle,
              message: feed.isOffline
                  ? l10n.notificationsOfflineMessage
                  : l10n.notificationsLoadErrorMessage,
              actionLabel: l10n.commonRetry,
              onAction: widget.onRefresh,
            ),
          ),
        ];
      }
      return [
        padded(
          const SliverToBoxAdapter(
            key: ValueKey('notifications-skeleton'),
            child: AppSkeletonRows(
              count: 6,
              leadingSize: notificationInboxLeadingSize,
            ),
          ),
        ),
      ];
    }

    final banner = feed.status == NotificationFeedStatus.error
        ? padded(
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: AppStateMessage.inline(
                  key: const ValueKey('notifications-refresh-error'),
                  icon: feed.isOffline
                      ? LucideIcons.wifiOff
                      : LucideIcons.cloudOff,
                  title: feed.isOffline
                      ? l10n.notificationsOfflineBanner
                      : l10n.notificationsRefreshFailed,
                  actionLabel: l10n.commonRetry,
                  onAction: widget.onRefresh,
                ),
              ),
            ),
          )
        : null;

    if (feed.items.isEmpty) {
      return [
        ?banner,
        message(
          AppStateMessage(
            key: const ValueKey('notifications-empty'),
            icon: widget.tab == NotificationsTab.archive
                ? LucideIcons.inbox
                : LucideIcons.bellCheck,
            illustration: const AppIllustration(
              AppIllustrationKind.notificationsClear,
            ),
            title: switch (widget.tab) {
              NotificationsTab.all => l10n.notificationsAllCaughtUp,
              NotificationsTab.inbox => l10n.notificationsInboxEmptyTitle,
              NotificationsTab.archive => l10n.notificationsReadEmptyTitle,
            },
          ),
        ),
      ];
    }

    final groups = groupNotificationsByDay(
      feed.items,
      widget.now ?? DateTime.now(),
    );
    return [
      ?banner,
      for (final group in groups)
        padded(
          SliverMainAxisGroup(
            key: ValueKey('notifications-group-${group.items.first.id}'),
            slivers: [
              SliverPersistentHeader(
                pinned: true,
                delegate: NotificationDayHeaderDelegate(
                  label: group.bucket.label(l10n),
                ),
              ),
              SliverList.separated(
                itemCount: group.items.length,
                itemBuilder: (context, index) => _row(group.items[index]),
                separatorBuilder: (context, index) => const Divider(
                  height: 1,
                  indent:
                      AppLayout.rowHorizontalPadding +
                      notificationInboxLeadingSize +
                      AppLayout.rowLeadingGap,
                ),
              ),
            ],
          ),
        ),
      if (feed.isLoadingMore)
        const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
            child: Center(child: AppLoadingIndicator.inline()),
          ),
        ),
    ];
  }

  Widget _row(AppNotification notification) => PendingSyncFrame(
    workspaceId: 'personal',
    feature: 'notifications',
    entityId: notification.id,
    relatedEntityIds: [
      if (notification.entityId != null) notification.entityId!,
    ],
    child: widget.itemBuilder(notification),
  );
}

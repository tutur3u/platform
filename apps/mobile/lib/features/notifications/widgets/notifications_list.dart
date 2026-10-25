part of 'notifications_sheet.dart';

class _NotificationsList extends StatefulWidget {
  const _NotificationsList({
    required this.tab,
    required this.feed,
    required this.pageMode,
    required this.onRefresh,
    required this.onLoadMore,
    required this.itemBuilder,
    super.key,
  });

  final NotificationsTab tab;
  final NotificationFeedState feed;
  final bool pageMode;
  final Future<void> Function() onRefresh;
  final Future<void> Function() onLoadMore;
  final Widget Function(AppNotification notification) itemBuilder;

  @override
  State<_NotificationsList> createState() => _NotificationsListState();
}

class _NotificationsListState extends State<_NotificationsList> {
  final ScrollController _scrollController = ScrollController();
  NotificationsTab? _lastAutoLoadTab;
  int? _lastAutoLoadCount;

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
    if (feed.status != NotificationFeedStatus.loaded) {
      _lastAutoLoadCount = null;
    } else if (feed.hasMore && !feed.isLoadingMore) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_scrollController.hasClients) return;
        final currentFeed = widget.feed;
        if (currentFeed.status != NotificationFeedStatus.loaded ||
            !currentFeed.hasMore ||
            currentFeed.isLoadingMore ||
            _scrollController.position.maxScrollExtent > 220 ||
            (_lastAutoLoadTab == widget.tab &&
                _lastAutoLoadCount == currentFeed.items.length)) {
          return;
        }
        _lastAutoLoadTab = widget.tab;
        _lastAutoLoadCount = currentFeed.items.length;
        unawaited(widget.onLoadMore());
      });
    }

    final child = LayoutBuilder(
      builder: (context, constraints) {
        final padding = widget.pageMode
            ? AppPageInsets.of(
                context,
                width: constraints.maxWidth,
                topInset: floatingShellHeaderInset(context),
              )
            : const EdgeInsets.only(bottom: AppSpacing.lg);
        return MediaQuery.removePadding(
          context: context,
          removeLeft: widget.pageMode,
          removeRight: widget.pageMode,
          removeBottom: widget.pageMode,
          child: _buildList(context, feed, padding),
        );
      },
    );

    return NovaRefreshIndicator(onRefresh: widget.onRefresh, child: child);
  }

  Widget _buildList(
    BuildContext context,
    NotificationFeedState feed,
    EdgeInsets padding,
  ) {
    if (feed.status == NotificationFeedStatus.loading && !feed.hasLoadedOnce) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: padding,
        children: const [
          AppGroupedCard(
            dividerInset: notificationDividerInset,
            children: [
              AppSkeletonRows(count: 4, leadingSize: notificationLeadingSize),
            ],
          ),
        ],
      );
    }
    if (feed.status == NotificationFeedStatus.error && !feed.hasLoadedOnce) {
      return _messageList(
        padding,
        AppStateMessage(
          icon: LucideIcons.cloudOff,
          tone: AppTone.destructive,
          title: context.l10n.notificationsLoadErrorTitle,
          message: context.l10n.notificationsLoadErrorMessage,
          actionLabel: context.l10n.commonRetry,
          onAction: widget.onRefresh,
        ),
        'error',
      );
    }
    if (feed.items.isEmpty) {
      final inbox = widget.tab == NotificationsTab.inbox;
      return _messageList(
        padding,
        AppStateMessage(
          icon: inbox ? LucideIcons.bellOff : LucideIcons.archive,
          title: inbox
              ? context.l10n.notificationsInboxEmptyTitle
              : context.l10n.notificationsArchiveEmptyTitle,
          message: inbox
              ? context.l10n.notificationsInboxEmptyMessage
              : context.l10n.notificationsArchiveEmptyMessage,
        ),
        'empty',
      );
    }

    final groups = groupNotificationsByDay(feed.items, DateTime.now());
    final itemCount = groups.length + (feed.isLoadingMore ? 1 : 0);
    return ListView.builder(
      controller: _scrollController,
      padding: padding,
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: itemCount,
      itemBuilder: (context, index) {
        if (index >= groups.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
            child: Center(
              child: Text(
                context.l10n.notificationsLoadingMore,
                style: AppTokens.of(context).typography.small.copyWith(
                  color: AppTokens.of(context).colorScheme.mutedForeground,
                ),
              ),
            ),
          );
        }
        final group = groups[index];
        return AppGroupedSection(
          key: ValueKey('notifications-group-${group.bucket.name}-$index'),
          caption: group.bucket.label(context.l10n),
          dividerInset: notificationDividerInset,
          bottomGap: index == itemCount - 1 ? 0 : AppLayout.sectionGap,
          children: [
            for (final notification in group.items)
              _buildNotificationItem(notification),
          ],
        );
      },
    );
  }

  Widget _messageList(EdgeInsets padding, Widget message, String kind) =>
      ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: padding,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 320),
            child: StaggeredEntrance(
              replayKey: '${widget.tab.name}-notifications-$kind',
              delay: const Duration(milliseconds: 40),
              child: message,
            ),
          ),
        ],
      );

  Widget _buildNotificationItem(AppNotification notification) {
    final index = widget.feed.items.indexOf(notification);
    return StaggeredEntrance(
      replayKey: '${widget.tab.name}-${notification.id}',
      delay: Duration(milliseconds: index.clamp(0, 6) * 40),
      child: PendingSyncFrame(
        workspaceId: 'personal',
        feature: 'notifications',
        entityId: notification.id,
        relatedEntityIds: [
          if (notification.entityId != null) notification.entityId!,
        ],
        child: widget.itemBuilder(notification),
      ),
    );
  }
}

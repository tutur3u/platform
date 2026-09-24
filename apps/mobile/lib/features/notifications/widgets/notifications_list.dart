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
    Widget child;
    if (feed.status == NotificationFeedStatus.loading && !feed.hasLoadedOnce) {
      child = ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(
            height: 320,
            child: Center(child: NovaLoadingIndicator(size: 42)),
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
            child: StaggeredEntrance(
              replayKey: '${widget.tab.name}-notifications-error',
              delay: const Duration(milliseconds: 40),
              child: _NotificationsEmptyState(
                title: context.l10n.notificationsLoadErrorTitle,
                message: context.l10n.notificationsLoadErrorMessage,
                actionLabel: context.l10n.commonRetry,
                onAction: widget.onRefresh,
              ),
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
            child: StaggeredEntrance(
              replayKey: '${widget.tab.name}-notifications-empty',
              delay: const Duration(milliseconds: 40),
              child: _NotificationsEmptyState(
                title: widget.tab == NotificationsTab.inbox
                    ? context.l10n.notificationsInboxEmptyTitle
                    : context.l10n.notificationsArchiveEmptyTitle,
                message: widget.tab == NotificationsTab.inbox
                    ? context.l10n.notificationsInboxEmptyMessage
                    : context.l10n.notificationsArchiveEmptyMessage,
              ),
            ),
          ),
        ],
      );
    } else {
      child = LayoutBuilder(
        builder: (context, constraints) {
          final columns = widget.pageMode
              ? (constraints.maxWidth / 280).floor().clamp(1, 3)
              : 1;
          final rows = (feed.items.length / columns).ceil();
          return ListView.separated(
            controller: _scrollController,
            padding: widget.pageMode
                ? const EdgeInsets.fromLTRB(0, 0, 0, 14)
                : const EdgeInsets.fromLTRB(0, 8, 0, 14),
            physics: const AlwaysScrollableScrollPhysics(),
            itemBuilder: (context, row) {
              if (row >= rows) {
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

              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var column = 0; column < columns; column++) ...[
                    if (column > 0) const SizedBox(width: 12),
                    Expanded(
                      child: row * columns + column < feed.items.length
                          ? _buildNotificationItem(row * columns + column)
                          : const SizedBox.shrink(),
                    ),
                  ],
                ],
              );
            },
            separatorBuilder: (context, index) =>
                SizedBox(height: widget.pageMode ? 12 : 10),
            itemCount: rows + (feed.isLoadingMore ? 1 : 0),
          );
        },
      );
    }

    return NovaRefreshIndicator(
      onRefresh: widget.onRefresh,
      child: widget.pageMode ? child : _NotificationsSurface(child: child),
    );
  }

  Widget _buildNotificationItem(int index) {
    final notification = widget.feed.items[index];
    return StaggeredEntrance(
      replayKey: '${widget.tab.name}-${notification.id}',
      delay: Duration(milliseconds: index.clamp(0, 6) * 40),
      child: widget.itemBuilder(notification),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.notification,
    required this.isPending,
    required this.openLabel,
    required this.onToggleRead,
    this.onAcceptInvite,
    this.onDeclineInvite,
    this.onOpen,
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
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);
    final hasPrimaryAction = onAcceptInvite != null || onDeclineInvite != null;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: isPending || hasPrimaryAction ? null : onOpen,
        child: Ink(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
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
                  color: _accentColor(
                    context,
                    notification.type,
                  ).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  _iconForType(notification.type),
                  size: 19,
                  color: _accentColor(context, notification.type),
                ),
              ),
              const shad.Gap(10),
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
                    const shad.Gap(3),
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
                    ] else if (onOpen != null && openLabel != null) ...[
                      const shad.Gap(8),
                      Text(
                        openLabel!,
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
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: NovaLoadingIndicator(size: 20),
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

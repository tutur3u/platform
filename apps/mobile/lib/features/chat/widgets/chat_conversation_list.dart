import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/network_avatar.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

part 'chat_conversation_tile.dart';

class ChatConversationList extends StatefulWidget {
  const ChatConversationList({
    required this.conversations,
    required this.selectedConversationId,
    required this.onSelected,
    required this.onLoadMore,
    required this.hasMore,
    required this.isLoadingMore,
    this.header,
    this.currentUserId,
    this.onArchive,
    this.onDelete,
    super.key,
  });

  final Widget? header;
  final String? currentUserId;
  final Future<void> Function(ChatConversation conversation)? onArchive;
  final Future<void> Function(ChatConversation conversation)? onDelete;
  final List<ChatConversation> conversations;
  final String? selectedConversationId;
  final ValueChanged<String> onSelected;
  final VoidCallback onLoadMore;
  final bool hasMore;
  final bool isLoadingMore;

  @override
  State<ChatConversationList> createState() => _ChatConversationListState();
}

class _ChatConversationListState extends State<ChatConversationList> {
  final _scrollController = ScrollController();
  int? _requestedSnapshot;
  bool _checkScheduled = false;

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scheduleLoad() {
    if (_checkScheduled) return;
    _checkScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkScheduled = false;
      if (!mounted ||
          !widget.hasMore ||
          widget.isLoadingMore ||
          !_scrollController.hasClients) {
        return;
      }
      final position = _scrollController.position;
      if (!position.hasContentDimensions ||
          position.extentAfter > position.viewportDimension * 0.75) {
        return;
      }
      // A failed/empty page must not spin indefinitely. Retain a manual retry;
      // resume automatic loading once the scoped list has actually advanced.
      final snapshot = Object.hashAll(
        widget.conversations.map((item) => Object.hash(item.wsId, item.id)),
      );
      if (_requestedSnapshot == snapshot) return;
      _requestedSnapshot = snapshot;
      widget.onLoadMore();
    });
  }

  @override
  Widget build(BuildContext context) {
    _scheduleLoad();
    return NotificationListener<ScrollMetricsNotification>(
      onNotification: (notification) {
        if (notification.depth == 0) _scheduleLoad();
        return false;
      },
      child: NotificationListener<ScrollNotification>(
        onNotification: (notification) {
          if (notification.depth == 0) _scheduleLoad();
          return false;
        },
        child: _buildList(context),
      ),
    );
  }

  Widget _buildList(BuildContext context) {
    return CustomScrollView(
      controller: _scrollController,
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        if (widget.header != null) SliverToBoxAdapter(child: widget.header),
        if (widget.conversations.isEmpty)
          SliverFillRemaining(hasScrollBody: false, child: _ChatEmptyList())
        else
          SliverPadding(
            padding: EdgeInsets.only(
              bottom:
                  MediaQuery.paddingOf(context).bottom + AppLayout.scrollEndGap,
            ),
            sliver: SliverList.separated(
              itemCount: widget.conversations.length,
              separatorBuilder: (_, _) => Divider(
                height: 1,
                indent: AppLayout.rowDividerInset,
                color: AppTokens.of(context).colorScheme.border,
              ),
              itemBuilder: (context, index) {
                final conversation = widget.conversations[index];
                return PendingSyncFrame(
                  workspaceId: conversation.wsId,
                  feature: 'chat',
                  entityId: conversation.id,
                  child: _ConversationTile(
                    conversation: conversation,
                    currentUserId: widget.currentUserId,
                    selected: conversation.id == widget.selectedConversationId,
                    onTap: () => widget.onSelected(conversation.id),
                    onArchive: widget.onArchive,
                    onDelete: widget.onDelete,
                  ),
                );
              },
            ),
          ),
        if (widget.hasMore)
          SliverToBoxAdapter(
            child: Center(
              child: AppButton.secondary(
                onPressed: widget.isLoadingMore ? null : widget.onLoadMore,
                child: widget.isLoadingMore
                    ? const AppLoadingIndicator.inline()
                    : Text(context.l10n.chatLoadMore),
              ),
            ),
          ),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
    super.key,
  });

  final Widget? header;
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
              bottom: MediaQuery.paddingOf(context).bottom + 16,
            ),
            sliver: SliverList.separated(
              itemCount: widget.conversations.length,
              separatorBuilder: (_, _) => Divider(
                height: 1,
                indent: 64,
                color: shad.Theme.of(context).colorScheme.border,
              ),
              itemBuilder: (context, index) {
                final conversation = widget.conversations[index];
                return PendingSyncFrame(
                  workspaceId: conversation.wsId,
                  feature: 'chat',
                  entityId: conversation.id,
                  child: _ConversationTile(
                    conversation: conversation,
                    selected: conversation.id == widget.selectedConversationId,
                    onTap: () => widget.onSelected(conversation.id),
                  ),
                );
              },
            ),
          ),
        if (widget.hasMore)
          SliverToBoxAdapter(
            child: Center(
              child: shad.OutlineButton(
                onPressed: widget.isLoadingMore ? null : widget.onLoadMore,
                child: Text(
                  widget.isLoadingMore
                      ? context.l10n.chatLoading
                      : context.l10n.chatLoadMore,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

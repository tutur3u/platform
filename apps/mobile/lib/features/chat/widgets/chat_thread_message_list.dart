part of 'chat_thread_view.dart';

class _MessageList extends StatefulWidget {
  const _MessageList({
    required this.conversation,
    required this.messages,
    required this.currentUserId,
    required this.streamingAssistantText,
    required this.onReaction,
    required this.onReply,
    required this.onDeleteMessage,
    required this.hasOlderMessages,
    required this.isLoadingOlderMessages,
    required this.onLoadOlderMessages,
    required this.isMessageSynced,
    required this.linkPreviews,
  });

  final ChatConversation conversation;
  final List<ChatMessage> messages;
  final String? currentUserId;
  final String streamingAssistantText;
  final void Function(ChatMessage message, String emoji) onReaction;
  final ValueChanged<ChatMessage>? onReply;
  final Future<void> Function(ChatMessage message)? onDeleteMessage;
  final bool hasOlderMessages;
  final bool isLoadingOlderMessages;
  final VoidCallback? onLoadOlderMessages;
  final bool Function(String messageId) isMessageSynced;
  final ChatLinkPreviewStore? linkPreviews;

  @override
  State<_MessageList> createState() => _MessageListState();
}

class _MessageListState extends State<_MessageList> {
  final ScrollController _scroll = ScrollController();
  final Map<String, GlobalKey> _keys = {};

  /// Builder index of each message row, refreshed on every build.
  Map<String, int> _indexById = const {};
  int _itemCount = 0;
  String? _highlightedId;
  Timer? _highlightTimer;

  @override
  void dispose() {
    _highlightTimer?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  GlobalKey _keyFor(String id) => _keys.putIfAbsent(id, GlobalKey.new);

  /// Scrolls to a loaded parent. A row outside the built range has no
  /// context yet, so jump by its share of the list and retry until it is
  /// built, then settle it into view.
  Future<void> _jumpTo(ChatMessage parent) async {
    for (var attempt = 0; attempt < 6; attempt++) {
      if (!mounted) return;
      final target = _keys[parent.id]?.currentContext;
      if (target != null) {
        if (!target.mounted) return;
        await Scrollable.ensureVisible(
          target,
          alignment: 0.4,
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOutCubic,
        );
        break;
      }
      final index = _indexById[parent.id];
      if (index == null || !_scroll.hasClients || _itemCount == 0) return;
      final position = _scroll.position;
      final extent = position.maxScrollExtent + position.viewportDimension;
      final estimate =
          extent * (index / _itemCount) - position.viewportDimension / 2;
      position.jumpTo(
        estimate.clamp(position.minScrollExtent, position.maxScrollExtent),
      );
      await WidgetsBinding.instance.endOfFrame;
    }
    if (!mounted) return;
    _highlightTimer?.cancel();
    setState(() => _highlightedId = parent.id);
    _highlightTimer = Timer(const Duration(milliseconds: 1400), () {
      if (mounted) setState(() => _highlightedId = null);
    });
  }

  /// Queued sends and the streaming reply are not on the server yet, so
  /// they take no reactions, replies or deletion.
  bool _isSynced(ChatMessage message) =>
      message.id != _streamingId && widget.isMessageSynced(message.id);

  void _openActions(ChatMessage message, {required bool mine}) {
    if (message.deletedAt != null) return;
    final pending = !_isSynced(message);
    unawaited(
      showChatMessageActions(
        context,
        message: message,
        currentUserId: widget.currentUserId,
        onReaction: pending
            ? null
            : (emoji) => widget.onReaction(message, emoji),
        onReply: widget.onReply == null || pending
            ? null
            : () => widget.onReply!(message),
        onDelete: !mine || pending || widget.onDeleteMessage == null
            ? null
            : () => widget.onDeleteMessage!(message),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final messages = [
      ...widget.messages,
      if (widget.streamingAssistantText.isNotEmpty)
        ChatMessage(
          id: _streamingId,
          conversationId: widget.conversation.id,
          content: widget.streamingAssistantText,
          kind: ChatMessageKind.assistant,
          createdAt: DateTime.now(),
        ),
    ];
    if (messages.isEmpty) {
      return _ThreadStart(
        conversation: widget.conversation,
        currentUserId: widget.currentUserId,
      );
    }
    final items = buildChatThreadItems(
      messages,
      currentUserId: widget.currentUserId,
      lastReadAt: chatLastReadAt(widget.conversation, widget.currentUserId),
    );
    final byId = {for (final message in messages) message.id: message};
    _keys.removeWhere((id, _) => !byId.containsKey(id));
    final historyRows = widget.hasOlderMessages ? 1 : 0;
    _itemCount = items.length + historyRows;
    _indexById = {
      for (var i = 0; i < items.length; i++)
        if (items[i] case ChatMessageItem(:final message))
          message.id: items.length - 1 - i,
    };
    final showNames = widget.conversation.type != ChatConversationType.direct;
    final showHistory = widget.hasOlderMessages;
    final seen = chatSeenReceipt(
      widget.conversation,
      messages,
      currentUserId: widget.currentUserId,
      isSynced: _isSynced,
    );

    // Rebuild when the offline queue changes, so a send that replays
    // becomes actionable without waiting for another state change.
    return ValueListenableBuilder(
      valueListenable: OfflineMutationQueue.instance.pending,
      builder: (context, _, _) => LayoutBuilder(
        builder: (context, constraints) {
          final bubbleWidth = (constraints.maxWidth * 0.78).clamp(220.0, 600.0);
          return ListView.builder(
            controller: _scroll,
            reverse: true,
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.md,
              AppSpacing.md,
              AppSpacing.md,
              AppSpacing.lg,
            ),
            itemCount: items.length + (showHistory ? 1 : 0),
            itemBuilder: (context, index) {
              if (index == items.length) {
                return _HistoryButton(
                  loading: widget.isLoadingOlderMessages,
                  onPressed: widget.onLoadOlderMessages,
                );
              }
              final item = items[items.length - 1 - index];
              return switch (item) {
                ChatDayItem(:final day) => _DayDivider(day: day),
                ChatUnreadItem() => const _UnreadDivider(),
                ChatMessageItem(:final message) =>
                  message.kind == ChatMessageKind.system
                      ? Padding(
                          padding: const EdgeInsets.symmetric(
                            vertical: AppSpacing.sm,
                          ),
                          child: ChatSystemMessage(message: message),
                        )
                      : Padding(
                          key: _keyFor(message.id),
                          padding: EdgeInsets.only(
                            bottom: item.endsGroup
                                ? AppSpacing.md
                                : AppSpacing.xxs,
                          ),
                          child: PendingSyncFrame(
                            workspaceId: widget.conversation.wsId,
                            feature: 'chat',
                            entityId: message.id,
                            child: _bubble(
                              item,
                              byId,
                              bubbleWidth,
                              showNames,
                              seen?.messageId == message.id
                                  ? seen?.readers
                                  : null,
                            ),
                          ),
                        ),
              };
            },
          );
        },
      ),
    );
  }

  Widget _bubble(
    ChatMessageItem item,
    Map<String, ChatMessage> byId,
    double maxWidth,
    bool showNames,
    List<ChatUserProfile>? readers,
  ) {
    final message = item.message;
    final replyId = message.replyToMessageId;
    final parent = replyId == null ? null : byId[replyId];
    final previews = widget.linkPreviews;
    final conversation = widget.conversation;
    return ChatMessageBubble(
      item: item,
      maxWidth: maxWidth,
      currentUserId: widget.currentUserId,
      showSenderName: showNames,
      hasReply: replyId != null,
      replyParent: parent,
      onJumpToReply: parent == null ? null : () => unawaited(_jumpTo(parent)),
      highlighted: _highlightedId == message.id,
      onReaction: _isSynced(message)
          ? (emoji) => widget.onReaction(message, emoji)
          : null,
      onOpenActions: message.id == _streamingId
          ? null
          : () => _openActions(message, mine: item.isMine),
      // The preview route serves server conversations' synced messages.
      linkPreviews:
          previews == null ||
              !_isSynced(message) ||
              !ChatCubit.isServerConversationId(conversation.id) ||
              message.content.isEmpty
          ? null
          : ChatLinkPreviews(
              store: previews,
              wsId: conversation.wsId,
              conversationId: conversation.id,
              content: chatMessageDisplayContent(message),
            ),
      receipt: readers == null
          ? null
          : ChatReadReceipt(
              readers: readers,
              direct: conversation.type == ChatConversationType.direct,
            ),
    );
  }
}

/// Id of the assistant reply that is still streaming.
const _streamingId = 'streaming-assistant';

class _DayDivider extends StatelessWidget {
  const _DayDivider({required this.day});

  final DateTime day;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Semantics(
        header: true,
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.xs,
            ),
            decoration: BoxDecoration(
              color: colors.card,
              border: Border.all(color: colors.border),
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: Text(
              chatDayLabel(context, day),
              style: tokens.typography.xSmall.copyWith(
                color: colors.mutedForeground,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _UnreadDivider extends StatelessWidget {
  const _UnreadDivider();

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final line = Expanded(
      child: Divider(color: colors.primary.withValues(alpha: 0.5), height: 1),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        children: [
          line,
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
            child: Text(
              context.l10n.chatNewMessages,
              style: tokens.typography.xSmall.copyWith(
                color: colors.primary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          line,
        ],
      ),
    );
  }
}

class _HistoryButton extends StatelessWidget {
  const _HistoryButton({required this.loading, required this.onPressed});

  final bool loading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Center(
        child: AppButton.outline(
          size: AppButtonSize.small,
          onPressed: loading ? null : onPressed,
          leading: loading
              ? const AppLoadingIndicator.inline()
              : const Icon(LucideIcons.history),
          child: Text(context.l10n.chatLoadOlderMessages),
        ),
      ),
    );
  }
}

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

  @override
  State<_MessageList> createState() => _MessageListState();
}

class _MessageListState extends State<_MessageList> {
  final Map<String, GlobalKey> _keys = {};
  String? _highlightedId;
  Timer? _highlightTimer;

  @override
  void dispose() {
    _highlightTimer?.cancel();
    super.dispose();
  }

  GlobalKey _keyFor(String id) => _keys.putIfAbsent(id, GlobalKey.new);

  void _jumpTo(ChatMessage parent) {
    final target = _keys[parent.id]?.currentContext;
    if (target == null) return;
    unawaited(
      Scrollable.ensureVisible(
        target,
        alignment: 0.4,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
      ),
    );
    _highlightTimer?.cancel();
    setState(() => _highlightedId = parent.id);
    _highlightTimer = Timer(const Duration(milliseconds: 1400), () {
      if (mounted) setState(() => _highlightedId = null);
    });
  }

  void _openActions(ChatMessage message, {required bool mine}) {
    if (message.deletedAt != null) return;
    final pending = !_isServerId(message.id);
    unawaited(
      showChatMessageActions(
        context,
        message: message,
        onReaction: (emoji) => widget.onReaction(message, emoji),
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
          id: 'streaming-assistant',
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
    final showNames = widget.conversation.type != ChatConversationType.direct;
    final showHistory = widget.hasOlderMessages;

    return LayoutBuilder(
      builder: (context, constraints) {
        final bubbleWidth = (constraints.maxWidth * 0.78).clamp(220.0, 600.0);
        return ListView.builder(
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
                          child: _bubble(item, byId, bubbleWidth, showNames),
                        ),
                      ),
            };
          },
        );
      },
    );
  }

  Widget _bubble(
    ChatMessageItem item,
    Map<String, ChatMessage> byId,
    double maxWidth,
    bool showNames,
  ) {
    final message = item.message;
    final replyId = message.replyToMessageId;
    final parent = replyId == null ? null : byId[replyId];
    return ChatMessageBubble(
      item: item,
      maxWidth: maxWidth,
      currentUserId: widget.currentUserId,
      showSenderName: showNames,
      hasReply: replyId != null,
      replyParent: parent,
      onJumpToReply: parent == null ? null : () => _jumpTo(parent),
      highlighted: _highlightedId == message.id,
      onReaction: (emoji) => widget.onReaction(message, emoji),
      onOpenActions: message.id == 'streaming-assistant'
          ? null
          : () => _openActions(message, mine: item.isMine),
    );
  }
}

/// Server message ids are UUIDs; optimistic and queued rows are not, and
/// cannot be replied to or deleted until they sync.
bool _isServerId(String id) => RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  caseSensitive: false,
).hasMatch(id);

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

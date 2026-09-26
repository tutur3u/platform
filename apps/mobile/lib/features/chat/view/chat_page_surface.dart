part of 'chat_page.dart';

class _ChatSurface extends StatelessWidget {
  const _ChatSurface({required this.state});

  final ChatState state;

  @override
  Widget build(BuildContext context) {
    final isWide = MediaQuery.sizeOf(context).width >= 700;
    return ResponsiveWrapper(
      maxWidth: ResponsivePadding.rootContentWidth(context.deviceClass),
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          ResponsivePadding.horizontal(context.deviceClass),
          10,
          ResponsivePadding.horizontal(context.deviceClass),
          0,
        ),
        child: isWide
            ? Row(
                children: [
                  SizedBox(
                    width: MediaQuery.sizeOf(context).width < 900 ? 260 : 340,
                    child: _ConversationPane(state: state),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: _ThreadPane(state: state)),
                ],
              )
            : _CompactChatSurface(state: state),
      ),
    );
  }
}

class _CompactChatSurface extends StatelessWidget {
  const _CompactChatSurface({required this.state});

  final ChatState state;

  @override
  Widget build(BuildContext context) {
    final hasSelected = state.selectedConversationId != null;
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 180),
      child: hasSelected
          ? _ThreadPane(key: const ValueKey('thread'), state: state)
          : _ConversationPane(key: const ValueKey('list'), state: state),
    );
  }
}

class _ConversationPane extends StatelessWidget {
  const _ConversationPane({required this.state, super.key});

  final ChatState state;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<ChatCubit>();
    return NovaRefreshIndicator(
      onRefresh: cubit.refresh,
      child: ChatConversationList(
        conversations: state.visibleConversations,
        selectedConversationId: state.selectedConversationId,
        isLoadingMore: state.isLoadingMore,
        hasMore: state.nextOffset != null,
        onLoadMore: () => unawaited(cubit.loadMoreConversations()),
        onSelected: (conversationId) =>
            unawaited(cubit.selectConversation(conversationId)),
      ),
    );
  }
}

class _ThreadPane extends StatelessWidget {
  const _ThreadPane({required this.state, super.key});

  final ChatState state;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<ChatCubit>();
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.paddingOf(context).bottom + 16,
      ),
      child: ChatThreadView(
        conversation: state.selectedConversation,
        messages: state.selectedMessages,
        messageStatus: state.messageStatus,
        currentUserId: context.select<AuthCubit, String?>(
          (cubit) => cubit.state.user?.id,
        ),
        pendingAttachments: state.pendingAttachments,
        streamingAssistantText: state.streamingAssistantText,
        isSending: state.isSending,
        isUploadingAttachment: state.isUploadingAttachment,
        onSend: (content) => unawaited(cubit.sendMessage(content)),
        onPickAttachment: cubit.uploadAttachment,
        onRemoveAttachment: cubit.removePendingAttachment,
        onReaction: (message, reaction) =>
            unawaited(cubit.toggleReaction(message, reaction)),
        onDetails: () =>
            unawaited(showChatDetailsSheet(context: context, cubit: cubit)),
        onPin: state.selectedConversation == null
            ? () {}
            : () => unawaited(cubit.togglePin(state.selectedConversation!)),
      ),
    );
  }
}

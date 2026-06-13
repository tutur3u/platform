part of 'chat_page.dart';

class _ChatSurface extends StatelessWidget {
  const _ChatSurface({required this.state});

  final ChatState state;

  @override
  Widget build(BuildContext context) {
    final isWide = MediaQuery.sizeOf(context).width >= 900;
    final bottomPadding = MediaQuery.paddingOf(context).bottom + 16;

    return ResponsiveWrapper(
      maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          ResponsivePadding.horizontal(context.deviceClass),
          10,
          ResponsivePadding.horizontal(context.deviceClass),
          bottomPadding,
        ),
        child: isWide
            ? Row(
                children: [
                  SizedBox(width: 340, child: _ConversationPane(state: state)),
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
          ? _ThreadPane(
              key: const ValueKey('thread'),
              state: state,
              showBack: true,
            )
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ChatFilters(state: state),
        const SizedBox(height: 10),
        Expanded(
          child: RefreshIndicator(
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
          ),
        ),
      ],
    );
  }
}

class _ThreadPane extends StatelessWidget {
  const _ThreadPane({required this.state, this.showBack = false, super.key});

  final ChatState state;
  final bool showBack;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<ChatCubit>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showBack)
          Align(
            alignment: Alignment.centerLeft,
            child: shad.OutlineButton(
              onPressed: () {
                context.read<ChatCubit>().clearSelection();
                context.go(Routes.chat);
              },
              leading: const Icon(shad.LucideIcons.arrowLeft, size: 16),
              child: Text(context.l10n.navBack),
            ),
          ),
        if (showBack) const SizedBox(height: 8),
        Expanded(
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
            onPickAttachment: (file) => unawaited(cubit.uploadAttachment(file)),
            onRemoveAttachment: cubit.removePendingAttachment,
            onReaction: (message, reaction) =>
                unawaited(cubit.toggleReaction(message, reaction)),
            onDetails: () =>
                unawaited(showChatDetailsSheet(context: context, cubit: cubit)),
            onPin: state.selectedConversation == null
                ? () {}
                : () => unawaited(cubit.togglePin(state.selectedConversation!)),
          ),
        ),
      ],
    );
  }
}

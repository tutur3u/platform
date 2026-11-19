part of 'chat_page.dart';

class _ChatSurface extends StatelessWidget {
  const _ChatSurface({required this.state});

  final ChatState state;

  /// Body width at which the conversation list and thread sit side by side.
  static const double twoPaneMinWidth = 700;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    // Pane decisions use the body width, which is narrower than the window
    // beside the navigation rail.
    builder: (context, constraints) {
      final bodyWidth = constraints.maxWidth;
      final isWide = bodyWidth >= twoPaneMinWidth;
      // The list and thread panes read the dock clearance themselves so they
      // can run beneath the dock.
      return AppPageBody(
        kind: AppPageKind.root,
        consumeBottomClearance: false,
        child: isWide
            ? Row(
                children: [
                  SizedBox(
                    key: const ValueKey('chat-conversation-pane'),
                    width: bodyWidth < 900 ? 260 : 340,
                    child: _ConversationPane(state: state),
                  ),
                  const SizedBox(width: AppLayout.itemGap),
                  Expanded(child: _ThreadPane(state: state)),
                ],
              )
            : _CompactChatSurface(state: state),
      );
    },
  );
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
        currentUserId: context.select<AuthCubit, String?>(
          (auth) => auth.state.user?.id,
        ),
        isLoadingMore: state.isLoadingMore,
        hasMore: state.nextOffset != null,
        onLoadMore: () => unawaited(cubit.loadMoreConversations()),
        onSelected: (conversationId) =>
            unawaited(cubit.selectConversation(conversationId)),
        onArchive: cubit.deleteConversation,
        onDelete: (conversation) =>
            _confirmDelete(context, cubit, conversation),
      ),
    );
  }
}

Future<void> _confirmDelete(
  BuildContext context,
  ChatCubit cubit,
  ChatConversation conversation,
) async {
  final confirmed = await showAppDialog<bool>(
    context: context,
    builder: (dialogContext) => AppDialog(
      title: dialogContext.l10n.chatDeleteConversation,
      content: Text(dialogContext.l10n.chatDeleteConversationConfirm),
      actions: [
        AppButton.ghost(
          onPressed: () => Navigator.of(dialogContext).pop(false),
          child: Text(dialogContext.l10n.commonCancel),
        ),
        AppButton.destructive(
          onPressed: () => Navigator.of(dialogContext).pop(true),
          child: Text(dialogContext.l10n.commonDelete),
        ),
      ],
    ),
  );
  if (confirmed == true) await cubit.deleteConversation(conversation);
}

class _ThreadPane extends StatelessWidget {
  const _ThreadPane({required this.state, super.key});

  final ChatState state;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<ChatCubit>();
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.paddingOf(context).bottom + AppLayout.boxEndGap,
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
      ),
    );
  }
}

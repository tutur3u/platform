part of 'chat_page.dart';

/// Conversation list beside the open thread on tablets and desktops
/// ([AppMasterDetail]); phones show one pane at a time and the dock's Back
/// returns from the thread to the list.
class _ChatSurface extends StatelessWidget {
  const _ChatSurface({required this.state, required this.onCreate});

  final ChatState state;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) => AppPageBody.fullBleed(
    // The panes read the dock clearance themselves so lists can run
    // beneath the dock while the composer stays above it.
    consumeBottomClearance: false,
    child: LayoutBuilder(
      builder: (context, constraints) {
        final list = _ConversationPane(state: state, onCreate: onCreate);
        if (!AppMasterDetailLayout.isSplit(constraints.maxWidth)) {
          final hasSelected = state.selectedConversationId != null;
          return AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            child: hasSelected
                ? _ThreadPane(key: const ValueKey('thread'), state: state)
                : KeyedSubtree(key: const ValueKey('list'), child: list),
          );
        }
        final cubit = context.read<ChatCubit>();
        return AppMasterDetail(
          master: KeyedSubtree(
            key: const ValueKey('chat-conversation-pane'),
            child: list,
          ),
          detailKey: state.selectedConversationId,
          detail: state.selectedConversationId == null
              ? null
              : _ThreadPane(state: state),
          emptyDetail: const ChatNoConversationSelected(),
          onCloseDetail: () {
            cubit.clearSelection();
            context.go(Routes.chat);
          },
        );
      },
    ),
  );
}

class _ConversationPane extends StatelessWidget {
  const _ConversationPane({required this.state, required this.onCreate});

  final ChatState state;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<ChatCubit>();
    return NovaRefreshIndicator(
      // Pull to refresh fetches from the server and merges, so loaded older
      // history stays; a failure still shows a toast.
      onRefresh: () =>
          cubit.refresh(quietly: true, fresh: true, reportFailure: true),
      child: ChatConversationList(
        conversations: state.visibleConversations,
        selectedConversationId: state.selectedConversationId,
        currentUserId: context.select<AuthCubit, String?>(
          (auth) => auth.state.user?.id,
        ),
        isLoading:
            state.status == ChatStatus.loading ||
            state.status == ChatStatus.initial,
        isLoadingMore: state.isLoadingMore,
        hasMore: state.nextOffset != null,
        onLoadMore: () => unawaited(cubit.loadMoreConversations()),
        onSelected: (conversationId) =>
            unawaited(cubit.selectConversation(conversationId)),
        onCreate: onCreate,
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
    final conversation = state.selectedConversation;
    final currentUserId = context.select<AuthCubit, String?>(
      (cubit) => cubit.state.user?.id,
    );
    final typingNames = [
      for (final member
          in conversation?.members ?? const <ChatConversationMember>[])
        if (state.typingUserIds.contains(member.userId) &&
            member.userId != currentUserId)
          member.user.displayName,
    ];
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom),
      // A readable column on wide panes; bubbles hug its edges.
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: _threadMaxWidth),
          child: ChatThreadView(
            conversation: conversation,
            messages: state.selectedMessages,
            messageStatus: state.messageStatus,
            currentUserId: currentUserId,
            pendingAttachments: state.pendingAttachments,
            streamingAssistantText: state.streamingAssistantText,
            isSending: state.isSending,
            isUploadingAttachment: state.isUploadingAttachment,
            onSend: (content) => unawaited(cubit.sendMessage(content)),
            onPickAttachment: cubit.uploadAttachment,
            onRemoveAttachment: cubit.removePendingAttachment,
            onReaction: (message, reaction) =>
                unawaited(cubit.toggleReaction(message, reaction)),
            replyTo: state.replyToMessage,
            onReply: cubit.startReply,
            onCancelReply: cubit.cancelReply,
            onDeleteMessage: cubit.deleteMessage,
            typingNames: typingNames,
            hasOlderMessages: state.selectedHasOlderMessages,
            isLoadingOlderMessages: state.isLoadingOlderMessages,
            onLoadOlderMessages: () => unawaited(cubit.loadOlderMessages()),
            isMessageSynced: cubit.isMessageSynced,
            onRetry: () => unawaited(
              cubit.selectConversation(
                state.selectedConversationId ?? '',
                forceRefresh: true,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Widest the thread column grows inside the detail pane.
const double _threadMaxWidth = 880;

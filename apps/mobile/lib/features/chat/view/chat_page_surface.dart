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
        _ChatOverviewCard(state: state),
        const SizedBox(height: 10),
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

class _ChatOverviewCard extends StatelessWidget {
  const _ChatOverviewCard({required this.state});

  final ChatState state;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final unreadCount = state.conversations.fold<int>(
      0,
      (total, conversation) => total + conversation.unreadCount,
    );

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: colorScheme.primary.withValues(alpha: 0.24)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            colorScheme.primary.withValues(alpha: 0.14),
            colorScheme.card,
          ],
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: colorScheme.primary.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(
              shad.LucideIcons.messagesSquare,
              size: 20,
              color: colorScheme.primary,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.l10n.chatTitle,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  context.l10n.appsHubChatDescription,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: colorScheme.mutedForeground,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
          if (unreadCount > 0) ...[
            const SizedBox(width: 10),
            Container(
              constraints: const BoxConstraints(minWidth: 30),
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
              decoration: BoxDecoration(
                color: colorScheme.primary,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                unreadCount > 99 ? '99+' : '$unreadCount',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: colorScheme.primaryForeground,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ],
        ],
      ),
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

part of 'chat_thread_view.dart';

class _MessageList extends StatelessWidget {
  const _MessageList({
    required this.workspaceId,
    required this.messages,
    required this.currentUserId,
    required this.onReaction,
  });

  final List<ChatMessage> messages;
  final String workspaceId;
  final String? currentUserId;
  final void Function(ChatMessage message, String emoji) onReaction;

  @override
  Widget build(BuildContext context) {
    // Only the start and end of a streamed reply rebuild the list; each token
    // rebuilds just the streaming bubble below.
    final isStreaming = context.select<ChatCubit, bool>(
      (cubit) => cubit.state.streamingAssistantText.isNotEmpty,
    );
    final streamingSlots = isStreaming ? 1 : 0;
    final itemCount = messages.length + streamingSlots;

    if (itemCount == 0) {
      return _ThreadEmpty(
        title: context.l10n.chatNoMessagesTitle,
        description: context.l10n.chatNoMessagesDescription,
      );
    }

    return ListView.builder(
      reverse: true,
      padding: const EdgeInsets.fromLTRB(10, 12, 10, 16),
      itemCount: itemCount,
      itemBuilder: (context, index) {
        if (index < streamingSlots) {
          return _MessageRow(
            workspaceId: workspaceId,
            entityId: _streamingAssistantId,
            child: _StreamingAssistantBubble(
              conversationId: messages.lastOrNull?.conversationId ?? '',
              onReaction: onReaction,
            ),
          );
        }
        final message = messages[itemCount - 1 - index];
        final isMine =
            currentUserId != null &&
            message.senderId != null &&
            message.senderId == currentUserId;
        return _MessageRow(
          workspaceId: workspaceId,
          entityId: message.id,
          child: _MessageBubble(
            message: message,
            isMine: isMine,
            onReaction: (emoji) => onReaction(message, emoji),
          ),
        );
      },
    );
  }
}

const _streamingAssistantId = 'streaming-assistant';

class _MessageRow extends StatelessWidget {
  const _MessageRow({
    required this.workspaceId,
    required this.entityId,
    required this.child,
  });

  final String workspaceId;
  final String entityId;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: PendingSyncFrame(
      workspaceId: workspaceId,
      feature: 'chat',
      entityId: entityId,
      child: child,
    ),
  );
}

/// The in-progress assistant reply, rebuilt per streamed token.
class _StreamingAssistantBubble extends StatelessWidget {
  const _StreamingAssistantBubble({
    required this.conversationId,
    required this.onReaction,
  });

  final String conversationId;
  final void Function(ChatMessage message, String emoji) onReaction;

  @override
  Widget build(BuildContext context) =>
      BlocSelector<ChatCubit, ChatState, String>(
        selector: (state) => state.streamingAssistantText,
        builder: (context, text) {
          final message = ChatMessage(
            id: _streamingAssistantId,
            conversationId: conversationId,
            content: text,
            kind: ChatMessageKind.assistant,
            createdAt: DateTime.now(),
          );
          return _MessageBubble(
            message: message,
            isMine: false,
            onReaction: (emoji) => onReaction(message, emoji),
          );
        },
      );
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    required this.isMine,
    required this.onReaction,
  });

  final ChatMessage message;
  final bool isMine;
  final ValueChanged<String> onReaction;

  @override
  Widget build(BuildContext context) {
    final colorScheme = shad.Theme.of(context).colorScheme;
    final bubbleColor = isMine
        ? colorScheme.primary.withValues(alpha: 0.20)
        : colorScheme.muted;
    final alignment = isMine ? Alignment.centerRight : Alignment.centerLeft;

    return Align(
      alignment: alignment,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width >= 700
              ? 520
              : MediaQuery.sizeOf(context).width * 0.82,
        ),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: bubbleColor,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(18),
              topRight: const Radius.circular(18),
              bottomLeft: Radius.circular(isMine ? 18 : 5),
              bottomRight: Radius.circular(isMine ? 5 : 18),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 9, 8, 7),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!isMine && message.sender != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      message.sender!.displayName,
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: colorScheme.mutedForeground,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                if (message.content.isNotEmpty)
                  Text(
                    message.content,
                    style: Theme.of(
                      context,
                    ).textTheme.bodyMedium?.copyWith(height: 1.35),
                  ),
                if (message.attachments.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  ...message.attachments.map(
                    (attachment) => ChatAttachmentPreview(
                      key: ValueKey(attachment.id),
                      attachment: attachment,
                    ),
                  ),
                ],
                if (message.reactions.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    children: message.reactions
                        .map(
                          (reaction) => ActionChip(
                            label: Text('${reaction.emoji} ${reaction.count}'),
                            onPressed: () => onReaction(reaction.emoji),
                          ),
                        )
                        .toList(growable: false),
                  ),
                ],
                const SizedBox(height: 2),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (message.createdAt != null)
                      Text(
                        MaterialLocalizations.of(context).formatTimeOfDay(
                          TimeOfDay.fromDateTime(message.createdAt!.toLocal()),
                          alwaysUse24HourFormat:
                              MediaQuery.alwaysUse24HourFormatOf(context),
                        ),
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: colorScheme.mutedForeground,
                        ),
                      ),
                    SizedBox(
                      height: 28,
                      width: 30,
                      child: PopupMenuButton<String>(
                        tooltip: MaterialLocalizations.of(
                          context,
                        ).showMenuTooltip,
                        padding: EdgeInsets.zero,
                        icon: Icon(
                          Icons.add_reaction_outlined,
                          size: 16,
                          color: colorScheme.mutedForeground,
                        ),
                        onSelected: onReaction,
                        itemBuilder: (context) => const [
                          PopupMenuItem(value: '+1', child: Text('+1')),
                          PopupMenuItem(value: 'ok', child: Text('ok')),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

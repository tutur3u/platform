part of 'chat_thread_view.dart';

class _MessageList extends StatelessWidget {
  const _MessageList({
    required this.messages,
    required this.currentUserId,
    required this.streamingAssistantText,
    required this.onReaction,
  });

  final List<ChatMessage> messages;
  final String? currentUserId;
  final String streamingAssistantText;
  final void Function(ChatMessage message, String emoji) onReaction;

  @override
  Widget build(BuildContext context) {
    final effectiveMessages = [
      ...messages,
      if (streamingAssistantText.isNotEmpty)
        ChatMessage(
          id: 'streaming-assistant',
          conversationId: messages.lastOrNull?.conversationId ?? '',
          content: streamingAssistantText,
          kind: ChatMessageKind.assistant,
          createdAt: DateTime.now(),
        ),
    ];

    if (effectiveMessages.isEmpty) {
      return _ThreadEmpty(
        title: context.l10n.chatNoMessagesTitle,
        description: context.l10n.chatNoMessagesDescription,
      );
    }

    return ListView.builder(
      reverse: true,
      padding: const EdgeInsets.fromLTRB(14, 18, 14, 18),
      itemCount: effectiveMessages.length,
      itemBuilder: (context, index) {
        final message = effectiveMessages[effectiveMessages.length - 1 - index];
        final isMine =
            currentUserId != null &&
            message.senderId != null &&
            message.senderId == currentUserId;
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
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
        ? colorScheme.primary.withValues(alpha: 0.14)
        : colorScheme.card;
    final alignment = isMine ? Alignment.centerRight : Alignment.centerLeft;

    return Align(
      alignment: alignment,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.78,
        ),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: bubbleColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colorScheme.border),
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
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
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      height: 1.35,
                    ),
                  ),
                if (message.attachments.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  ...message.attachments.map(_AttachmentChip.new),
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
                const SizedBox(height: 4),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _ReactionButton(label: '+1', onTap: () => onReaction('+1')),
                    _ReactionButton(label: 'ok', onTap: () => onReaction('ok')),
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

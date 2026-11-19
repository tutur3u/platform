part of 'chat_thread_view.dart';

class _MessageList extends StatelessWidget {
  const _MessageList({
    required this.workspaceId,
    required this.messages,
    required this.currentUserId,
    required this.streamingAssistantText,
    required this.onReaction,
  });

  final List<ChatMessage> messages;
  final String workspaceId;
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
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.sm,
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.lg,
      ),
      itemCount: effectiveMessages.length,
      itemBuilder: (context, index) {
        final message = effectiveMessages[effectiveMessages.length - 1 - index];
        final isMine =
            currentUserId != null &&
            message.senderId != null &&
            message.senderId == currentUserId;
        return Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: PendingSyncFrame(
            workspaceId: workspaceId,
            feature: 'chat',
            entityId: message.id,
            child: _MessageBubble(
              message: message,
              isMine: isMine,
              onReaction: (emoji) => onReaction(message, emoji),
            ),
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
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final bubbleColor = isMine
        ? colors.primary.withValues(alpha: colors.isDark ? 0.28 : 0.16)
        : colors.muted;
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
              topLeft: const Radius.circular(AppRadius.md),
              topRight: const Radius.circular(AppRadius.md),
              bottomLeft: Radius.circular(isMine ? AppRadius.md : AppRadius.xs),
              bottomRight: Radius.circular(
                isMine ? AppRadius.xs : AppRadius.md,
              ),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.md,
              AppSpacing.sm,
              AppSpacing.sm,
              AppSpacing.sm,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!isMine && message.sender != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      message.sender!.displayName,
                      style: tokens.typography.small.copyWith(
                        color: colors.mutedForeground,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                if (message.content.isNotEmpty)
                  MarkdownBody(
                    data: message.content,
                    selectable: true,
                    softLineBreak: true,
                    styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context))
                        .copyWith(
                          p: tokens.typography.body.copyWith(
                            color: colors.foreground,
                            height: 1.35,
                          ),
                        ),
                    imageBuilder: (uri, title, alt) => Text(alt ?? ''),
                    onTapLink: (text, href, title) {
                      final uri = href == null ? null : Uri.tryParse(href);
                      if (uri != null &&
                          (uri.scheme == 'https' || uri.scheme == 'http')) {
                        unawaited(openMobileLink(context, uri));
                      }
                    },
                  ),
                if (message.attachments.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.sm),
                  ...message.attachments.map(
                    (attachment) => ChatAttachmentPreview(
                      key: ValueKey(attachment.id),
                      attachment: attachment,
                    ),
                  ),
                ],
                if (message.reactions.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(
                    spacing: AppSpacing.xs,
                    runSpacing: AppSpacing.xs,
                    children: message.reactions
                        .map(
                          (reaction) => AppChip(
                            label: Text('${reaction.emoji} ${reaction.count}'),
                            onPressed: () => onReaction(reaction.emoji),
                          ),
                        )
                        .toList(growable: false),
                  ),
                ],
                const SizedBox(height: AppSpacing.xxs),
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
                        style: tokens.typography.xSmall.copyWith(
                          color: colors.mutedForeground,
                        ),
                      ),
                    PopupMenuButton<String>(
                      tooltip: MaterialLocalizations.of(
                        context,
                      ).showMenuTooltip,
                      icon: Icon(
                        LucideIcons.smile,
                        size: 16,
                        color: colors.mutedForeground,
                      ),
                      onSelected: onReaction,
                      itemBuilder: (context) => const [
                        PopupMenuItem(value: '+1', child: Text('+1')),
                        PopupMenuItem(value: 'ok', child: Text('ok')),
                      ],
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

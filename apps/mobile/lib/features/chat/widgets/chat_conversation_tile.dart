part of 'chat_conversation_list.dart';

class _ChatEmptyList extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final colorScheme = shad.Theme.of(context).colorScheme;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              shad.LucideIcons.messagesSquare,
              size: 34,
              color: colorScheme.mutedForeground,
            ),
            const SizedBox(height: 12),
            Text(
              context.l10n.chatNoConversationsTitle,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text(
              context.l10n.chatNoConversationsDescription,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: colorScheme.mutedForeground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({
    required this.conversation,
    required this.selected,
    required this.onTap,
  });

  final ChatConversation conversation;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final latest = conversation.latestMessage?.content.trim();
    final lastActivity =
        conversation.latestMessage?.createdAt ?? conversation.updatedAt;
    final localActivity = lastActivity.toLocal();
    final today = DateTime.now();
    final isToday =
        today.year == localActivity.year &&
        today.month == localActivity.month &&
        today.day == localActivity.day;
    final timeLabel = isToday
        ? MaterialLocalizations.of(context).formatTimeOfDay(
            TimeOfDay.fromDateTime(localActivity),
            alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context),
          )
        : DateFormat.MMMd(
            Localizations.localeOf(context).toLanguageTag(),
          ).format(localActivity);

    return Material(
      color: selected
          ? colorScheme.primary.withValues(alpha: 0.10)
          : Colors.transparent,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
          child: Row(
            children: [
              _ConversationIcon(type: conversation.type),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            conversation.displayTitle(
                              fallback: context.l10n.chatUntitled,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.titleSmall
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                        ),
                        if (conversation.isPinned)
                          Icon(
                            shad.LucideIcons.pin,
                            size: 13,
                            color: colorScheme.mutedForeground,
                          ),
                        const SizedBox(width: 6),
                        Text(
                          timeLabel,
                          style: Theme.of(context).textTheme.labelSmall
                              ?.copyWith(
                                color: conversation.unreadCount > 0
                                    ? colorScheme.primary
                                    : colorScheme.mutedForeground,
                              ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            latest == null || latest.isEmpty
                                ? _typeLabel(context, conversation.type)
                                : latest,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  color: conversation.unreadCount > 0
                                      ? colorScheme.foreground
                                      : colorScheme.mutedForeground,
                                  fontWeight: conversation.unreadCount > 0
                                      ? FontWeight.w600
                                      : null,
                                ),
                          ),
                        ),
                        if (conversation.unreadCount > 0) ...[
                          const SizedBox(width: 8),
                          _UnreadBadge(count: conversation.unreadCount),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _typeLabel(BuildContext context, ChatConversationType type) {
    return switch (type) {
      ChatConversationType.ai => context.l10n.chatAi,
      ChatConversationType.channel => context.l10n.chatChannels,
      ChatConversationType.direct => context.l10n.chatDirect,
      ChatConversationType.group => context.l10n.chatGroups,
    };
  }
}

class _ConversationIcon extends StatelessWidget {
  const _ConversationIcon({required this.type});

  final ChatConversationType type;

  @override
  Widget build(BuildContext context) {
    final colorScheme = shad.Theme.of(context).colorScheme;
    final icon = switch (type) {
      ChatConversationType.ai => shad.LucideIcons.bot,
      ChatConversationType.channel => shad.LucideIcons.hash,
      ChatConversationType.direct => shad.LucideIcons.user,
      ChatConversationType.group => shad.LucideIcons.users,
    };

    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        color: colorScheme.primary.withValues(alpha: 0.12),
        shape: BoxShape.circle,
      ),
      child: Icon(icon, size: 20, color: colorScheme.primary),
    );
  }
}

class _UnreadBadge extends StatelessWidget {
  const _UnreadBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final colorScheme = shad.Theme.of(context).colorScheme;
    return Container(
      constraints: const BoxConstraints(minWidth: 22),
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: colorScheme.primary,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        count > 99 ? '99+' : count.toString(),
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: colorScheme.primaryForeground,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

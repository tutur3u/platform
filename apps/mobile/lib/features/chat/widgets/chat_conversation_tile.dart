part of 'chat_conversation_list.dart';

class _ChatEmptyList extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppStateMessage(
      icon: LucideIcons.messagesSquare,
      title: l10n.chatNoConversationsTitle,
      message: l10n.chatNoConversationsDescription,
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({
    required this.conversation,
    required this.selected,
    required this.onTap,
    this.currentUserId,
    this.onArchive,
    this.onDelete,
  });

  final ChatConversation conversation;
  final String? currentUserId;
  final bool selected;
  final VoidCallback onTap;
  final Future<void> Function(ChatConversation conversation)? onArchive;
  final Future<void> Function(ChatConversation conversation)? onDelete;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final latest = conversation.latestMessage?.content.trim();
    final preview = latest == null || latest.isEmpty
        ? l10n.chatNoMessagesTitle
        : latest;
    final row = AppRichRow(
      title: conversation.displayTitle(fallback: l10n.chatUntitled),
      subtitle: preview,
      selected: selected,
      leading: _ConversationAvatar(
        conversation: conversation,
        currentUserId: currentUserId,
      ),
      trailing: _ConversationTrailing(conversation: conversation),
      semanticLabel: conversation.unreadCount > 0
          ? '${conversation.displayTitle(fallback: l10n.chatUntitled)}, '
                '$preview, ${conversation.unreadCount}'
          : null,
      onTap: onTap,
    );
    final canSwipe =
        !conversation.isReadOnlyAgent &&
        (onArchive != null || onDelete != null);
    if (!canSwipe) return row;
    return AppSwipeActions(
      leading: onArchive == null
          ? null
          : AppSwipeAction(
              label: l10n.chatArchive,
              icon: LucideIcons.archive,
              onPressed: () => onArchive!(conversation),
            ),
      trailing: [
        if (onDelete != null)
          AppSwipeAction(
            label: l10n.commonDelete,
            icon: LucideIcons.trash2,
            tone: AppTone.destructive,
            onPressed: () => onDelete!(conversation),
          ),
      ],
      child: row,
    );
  }
}

class _ConversationAvatar extends StatelessWidget {
  const _ConversationAvatar({
    required this.conversation,
    required this.currentUserId,
  });

  final ChatConversation conversation;
  final String? currentUserId;

  @override
  Widget build(BuildContext context) {
    return switch (conversation.type) {
      ChatConversationType.ai => const AppIconTile(
        icon: LucideIcons.sparkles,
        tone: AppTone.primary,
      ),
      ChatConversationType.channel => const AppIconTile(icon: LucideIcons.hash),
      ChatConversationType.group => const AppIconTile(icon: LucideIcons.users),
      ChatConversationType.direct => _personAvatar(context),
    };
  }

  Widget _personAvatar(BuildContext context) {
    final others = conversation.members.where(
      (member) => member.userId != currentUserId,
    );
    final person = others.isEmpty
        ? (conversation.members.isEmpty ? null : conversation.members.first)
        : others.first;
    if (person == null) {
      return const AppIconTile(icon: LucideIcons.user);
    }
    final name = person.user.displayName.trim();
    final initial = name.isEmpty ? '?' : name.characters.first.toUpperCase();
    return NetworkAvatar(
      avatarUrl: person.user.avatarUrl,
      radius: AppLayout.rowLeadingSize / 2,
      child: Text(initial),
    );
  }
}

class _ConversationTrailing extends StatelessWidget {
  const _ConversationTrailing({required this.conversation});

  final ChatConversation conversation;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final unread = conversation.unreadCount > 0;
    final time = _timeLabel(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          time,
          style: tokens.typography.xSmall.copyWith(
            color: unread ? colors.primary : colors.mutedForeground,
            fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
        if (conversation.isPinned || unread) ...[
          const SizedBox(height: AppSpacing.xs),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (conversation.isPinned)
                Icon(LucideIcons.pin, size: 14, color: colors.mutedForeground),
              if (conversation.isPinned && unread)
                const SizedBox(width: AppSpacing.xs),
              if (unread)
                AppBadge(
                  variant: AppBadgeVariant.primary,
                  child: Text(
                    conversation.unreadCount > 99
                        ? '99+'
                        : '${conversation.unreadCount}',
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }

  String _timeLabel(BuildContext context) {
    final lastActivity =
        conversation.latestMessage?.createdAt ?? conversation.updatedAt;
    final localActivity = lastActivity.toLocal();
    final today = DateTime.now();
    final isToday =
        today.year == localActivity.year &&
        today.month == localActivity.month &&
        today.day == localActivity.day;
    if (isToday) {
      return MaterialLocalizations.of(context).formatTimeOfDay(
        TimeOfDay.fromDateTime(localActivity),
        alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context),
      );
    }
    return DateFormat.MMMd(
      Localizations.localeOf(context).toLanguageTag(),
    ).format(localActivity);
  }
}

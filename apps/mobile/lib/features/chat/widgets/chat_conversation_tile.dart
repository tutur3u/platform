part of 'chat_conversation_list.dart';

class _ChatEmptyList extends StatelessWidget {
  const _ChatEmptyList({this.onCreate});

  final VoidCallback? onCreate;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppStateMessage(
      icon: LucideIcons.messagesSquare,
      illustration: const AppIllustration(AppIllustrationKind.conversations),
      title: l10n.chatNoConversationsTitle,
      message: l10n.chatNoConversationsDescription,
      actionLabel: onCreate == null ? null : l10n.chatNew,
      onAction: onCreate,
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
    final title = conversation.displayTitle(fallback: l10n.chatUntitled);
    final preview = _preview(context);
    final unread = conversation.unreadCount;
    final row = Semantics(
      button: true,
      selected: selected,
      label: [
        title,
        preview,
        if (unread > 0) l10n.chatUnreadCount(unread),
      ].join(', '),
      onTap: onTap,
      excludeSemantics: true,
      child: _TileSurface(
        selected: selected,
        onTap: onTap,
        child: Row(
          children: [
            ChatConversationAvatar(
              conversation: conversation,
              currentUserId: currentUserId,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: _TileText(conversation: conversation, preview: preview),
            ),
          ],
        ),
      ),
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

  /// Latest message, prefixed with its sender in shared conversations.
  String _preview(BuildContext context) {
    final l10n = context.l10n;
    final latest = conversation.latestMessage;
    if (latest == null) return l10n.chatNoMessagesTitle;
    final text = chatMessagePreview(context, latest);
    if (text.isEmpty) return l10n.chatNoMessagesTitle;
    final mine = currentUserId != null && latest.senderId == currentUserId;
    if (mine) return l10n.chatPreviewFromYou(text);
    final shared =
        conversation.type == ChatConversationType.channel ||
        conversation.type == ChatConversationType.group;
    if (shared && latest.kind == ChatMessageKind.user) {
      final name = latest.sender?.displayName.trim() ?? '';
      if (name.isNotEmpty) {
        return l10n.chatPreviewFromSender(name.split(' ').first, text);
      }
    }
    return text;
  }
}

class _TileSurface extends StatelessWidget {
  const _TileSurface({
    required this.selected,
    required this.onTap,
    required this.child,
  });

  final bool selected;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final radius = BorderRadius.circular(AppRadius.sm);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1),
      child: Material(
        color: selected
            ? colors.primary.withValues(alpha: colors.isDark ? 0.18 : 0.09)
            : Colors.transparent,
        borderRadius: radius,
        child: InkWell(
          borderRadius: radius,
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 68),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.md,
              ),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}

class _TileText extends StatelessWidget {
  const _TileText({required this.conversation, required this.preview});

  final ChatConversation conversation;
  final String preview;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final type = tokens.typography;
    final unread = conversation.unreadCount > 0;
    final lastActivity =
        conversation.latestMessage?.createdAt ?? conversation.updatedAt;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                conversation.displayTitle(fallback: context.l10n.chatUntitled),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.base.copyWith(
                  color: colors.foreground,
                  fontWeight: unread ? FontWeight.w700 : FontWeight.w600,
                  height: 1.25,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Text(
              chatListTime(context, lastActivity),
              style: type.xSmall.copyWith(
                color: unread ? colors.primary : colors.mutedForeground,
                fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.xxs),
        Row(
          children: [
            Expanded(
              child: Text(
                preview,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.small.copyWith(
                  color: unread ? colors.foreground : colors.mutedForeground,
                  fontWeight: unread ? FontWeight.w500 : FontWeight.w400,
                  height: 1.35,
                ),
              ),
            ),
            if (conversation.isMuted) ...[
              const SizedBox(width: AppSpacing.xs),
              Icon(
                LucideIcons.bellOff,
                size: 14,
                color: colors.mutedForeground,
              ),
            ],
            if (unread) ...[
              const SizedBox(width: AppSpacing.sm),
              AppBadge(
                variant: AppBadgeVariant.primary,
                child: Text(
                  conversation.unreadCount > 99
                      ? '99+'
                      : '${conversation.unreadCount}',
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

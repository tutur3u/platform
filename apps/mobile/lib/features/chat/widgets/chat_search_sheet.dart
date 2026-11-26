part of 'chat_sheets.dart';

/// Search across the workspace's conversations (by title or member name)
/// and messages, both answered by the server, shown in place of the list
/// while the shell search field is open.
class ChatSearchResults extends StatelessWidget {
  const ChatSearchResults({
    required this.state,
    required this.onSelect,
    this.query = '',
    this.currentUserId,
    super.key,
  });

  final ChatState state;
  final ValueChanged<String> onSelect;
  final String query;
  final String? currentUserId;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final needle = query.trim().toLowerCase();
    if (needle.isEmpty) {
      return AppStateMessage(
        icon: LucideIcons.search,
        title: l10n.chatSearchMessages,
        message: l10n.chatSearchHint,
      );
    }
    // The server's matches (title or member names) once they arrive; the
    // loaded list matched by title until then, or when it cannot answer.
    final conversations =
        (state.conversationSearchResults ??
                state.conversations.where(
                  (conversation) => conversation
                      .displayTitle(fallback: l10n.chatUntitled)
                      .toLowerCase()
                      .contains(needle),
                ))
            .take(8)
            .toList(growable: false);
    final messages = state.searchResults;
    if (conversations.isEmpty && messages.isEmpty) {
      return AppStateMessage(
        icon: LucideIcons.search,
        illustration: const AppIllustration(
          AppIllustrationKind.searchNoResults,
        ),
        title: l10n.chatNoSearchResults,
      );
    }
    final titles = {
      for (final conversation in state.conversations)
        conversation.id: conversation.displayTitle(fallback: l10n.chatUntitled),
    };
    return LayoutBuilder(
      builder: (context, constraints) => ListView(
        padding: AppPageInsets.of(
          context,
          width: constraints.maxWidth,
          kind: AppPageKind.reading,
        ),
        children: [
          if (conversations.isNotEmpty) ...[
            AppSectionCaption(l10n.chatSearchConversations),
            for (final conversation in conversations)
              AppRichRow(
                title: conversation.displayTitle(fallback: l10n.chatUntitled),
                leading: ChatConversationAvatar(
                  conversation: conversation,
                  currentUserId: currentUserId,
                ),
                onTap: () => onSelect(conversation.id),
              ),
          ],
          if (messages.isNotEmpty) ...[
            AppSectionCaption(l10n.chatSearchMessagesSection),
            for (final message in messages)
              AppRichRow(
                title: chatSenderName(context, message),
                subtitle: chatMessagePreview(context, message),
                trailingCaption: message.createdAt == null
                    ? null
                    : chatListTime(context, message.createdAt!),
                meta: [
                  if (titles[message.conversationId] case final title?)
                    AppMetaItem(label: title, icon: LucideIcons.hash),
                ],
                leading: ChatSenderAvatar(message: message, size: 40),
                onTap: () => onSelect(message.conversationId),
              ),
          ],
        ],
      ),
    );
  }
}

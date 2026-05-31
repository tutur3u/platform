import 'package:flutter/material.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'chat_conversation_tile.dart';

class ChatConversationList extends StatelessWidget {
  const ChatConversationList({
    required this.conversations,
    required this.selectedConversationId,
    required this.onSelected,
    required this.onLoadMore,
    required this.hasMore,
    required this.isLoadingMore,
    super.key,
  });

  final List<ChatConversation> conversations;
  final String? selectedConversationId;
  final ValueChanged<String> onSelected;
  final VoidCallback onLoadMore;
  final bool hasMore;
  final bool isLoadingMore;

  @override
  Widget build(BuildContext context) {
    if (conversations.isEmpty) {
      return _ChatEmptyList();
    }

    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: conversations.length + (hasMore ? 1 : 0),
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        if (index >= conversations.length) {
          return Center(
            child: shad.OutlineButton(
              onPressed: isLoadingMore ? null : onLoadMore,
              child: Text(
                isLoadingMore
                    ? context.l10n.chatLoading
                    : context.l10n.chatLoadMore,
              ),
            ),
          );
        }

        final conversation = conversations[index];
        return _ConversationTile(
          conversation: conversation,
          selected: conversation.id == selectedConversationId,
          onTap: () => onSelected(conversation.id),
        );
      },
    );
  }
}

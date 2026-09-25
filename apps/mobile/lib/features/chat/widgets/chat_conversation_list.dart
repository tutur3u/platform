import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
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
    this.header,
    super.key,
  });

  final Widget? header;
  final List<ChatConversation> conversations;
  final String? selectedConversationId;
  final ValueChanged<String> onSelected;
  final VoidCallback onLoadMore;
  final bool hasMore;
  final bool isLoadingMore;

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        if (header != null) SliverToBoxAdapter(child: header),
        if (conversations.isEmpty)
          SliverFillRemaining(hasScrollBody: false, child: _ChatEmptyList())
        else
          SliverPadding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.paddingOf(context).bottom + 16,
            ),
            sliver: SliverList.separated(
              itemCount: conversations.length + (hasMore ? 1 : 0),
              separatorBuilder: (_, _) => Divider(
                height: 1,
                indent: 64,
                color: shad.Theme.of(context).colorScheme.border,
              ),
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
            ),
          ),
      ],
    );
  }
}

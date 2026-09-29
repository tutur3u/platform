part of 'chat_sheets.dart';

class ChatSearchResults extends StatelessWidget {
  const ChatSearchResults({
    required this.state,
    required this.onSelect,
    super.key,
  });

  final ChatState state;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    if (state.searchResults.isEmpty) {
      return Center(child: Text(context.l10n.chatNoSearchResults));
    }
    return ListView.separated(
      padding: EdgeInsets.fromLTRB(
        16,
        12,
        16,
        MediaQuery.paddingOf(context).bottom + 96,
      ),
      itemCount: state.searchResults.length,
      separatorBuilder: (_, _) => const shad.Divider(height: 1),
      itemBuilder: (context, index) {
        final message = state.searchResults[index];
        return ListTile(
          title: Text(
            message.content,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          subtitle: Text(message.sender?.displayName ?? ''),
          onTap: () => onSelect(message.conversationId),
        );
      },
    );
  }
}

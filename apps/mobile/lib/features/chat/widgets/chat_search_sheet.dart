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
      return AppStateMessage(
        icon: LucideIcons.search,
        title: context.l10n.chatNoSearchResults,
      );
    }
    return LayoutBuilder(
      builder: (context, constraints) => ListView.separated(
        padding: AppPageInsets.of(context, width: constraints.maxWidth),
        itemCount: state.searchResults.length,
        separatorBuilder: (_, _) => const AppDivider(),
        itemBuilder: (context, index) {
          final message = state.searchResults[index];
          return AppRichRow(
            title: message.content,
            subtitle: message.sender?.displayName,
            leading: const AppIconTile(icon: LucideIcons.messageSquare),
            onTap: () => onSelect(message.conversationId),
          );
        },
      ),
    );
  }
}

part of 'chat_sheets.dart';

class ChatSearchSheet extends StatefulWidget {
  const ChatSearchSheet({super.key});

  @override
  State<ChatSearchSheet> createState() => _ChatSearchSheetState();
}

class _ChatSearchSheetState extends State<ChatSearchSheet> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = shad.Theme.of(context).colorScheme;
    return SafeArea(
      child: ColoredBox(
        color: colorScheme.background,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            12,
            20,
            20 + MediaQuery.paddingOf(context).bottom,
          ),
          child: BlocBuilder<ChatCubit, ChatState>(
            builder: (context, state) {
              final cubit = context.read<ChatCubit>();
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _SheetHeader(title: context.l10n.chatSearchMessages),
                  const SizedBox(height: 14),
                  shad.TextField(
                    contextMenuBuilder: platformTextContextMenuBuilder(),
                    controller: _controller,
                    hintText: context.l10n.chatSearch,
                    autofocus: true,
                    onChanged: (value) =>
                        unawaited(cubit.searchMessages(value)),
                  ),
                  const SizedBox(height: 12),
                  ConstrainedBox(
                    constraints: BoxConstraints(
                      maxHeight: MediaQuery.sizeOf(context).height * 0.55,
                    ),
                    child: state.searchResults.isEmpty
                        ? Center(child: Text(context.l10n.chatNoSearchResults))
                        : ListView.separated(
                            shrinkWrap: true,
                            itemCount: state.searchResults.length,
                            separatorBuilder: (_, _) =>
                                const shad.Divider(height: 1),
                            itemBuilder: (context, index) {
                              final message = state.searchResults[index];
                              return ListTile(
                                title: Text(
                                  message.content,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                subtitle: Text(
                                  message.sender?.displayName ?? '',
                                ),
                                onTap: () {
                                  unawaited(
                                    cubit.selectConversation(
                                      message.conversationId,
                                      forceRefresh: true,
                                    ),
                                  );
                                  unawaited(Navigator.maybePop(context));
                                },
                              );
                            },
                          ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

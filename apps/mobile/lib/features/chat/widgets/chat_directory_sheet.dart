part of 'chat_sheets.dart';

class ChatDirectorySheet extends StatefulWidget {
  const ChatDirectorySheet({super.key});

  @override
  State<ChatDirectorySheet> createState() => _ChatDirectorySheetState();
}

class _ChatDirectorySheetState extends State<ChatDirectorySheet> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _searchController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    _searchController.dispose();
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
              return SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _SheetHeader(title: context.l10n.chatDirectory),
                    const SizedBox(height: 16),
                    shad.TextField(
                      contextMenuBuilder: platformTextContextMenuBuilder(),
                      controller: _searchController,
                      hintText: context.l10n.chatSearchPeople,
                      onChanged: (value) =>
                          unawaited(cubit.searchDirectory(value)),
                    ),
                    const SizedBox(height: 12),
                    _DirectoryResults(users: state.directoryResults),
                    const SizedBox(height: 20),
                    Text(
                      context.l10n.chatFriendRequests,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: shad.TextField(
                            contextMenuBuilder:
                                platformTextContextMenuBuilder(),
                            controller: _emailController,
                            hintText: context.l10n.chatEmailHint,
                          ),
                        ),
                        const SizedBox(width: 8),
                        shad.PrimaryButton(
                          onPressed: () {
                            unawaited(
                              cubit.createFriendRequest(_emailController.text),
                            );
                            _emailController.clear();
                          },
                          child: Text(context.l10n.commonCreate),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    _FriendRequestGroup(
                      title: context.l10n.chatIncoming,
                      requests: state.friendRequests.incoming,
                      actionsBuilder: (request) => [
                        shad.PrimaryButton(
                          onPressed: () => unawaited(
                            cubit.respondFriendRequest(
                              request,
                              ChatFriendRequestStatus.accepted,
                            ),
                          ),
                          child: Text(context.l10n.chatAccept),
                        ),
                        shad.OutlineButton(
                          onPressed: () => unawaited(
                            cubit.respondFriendRequest(
                              request,
                              ChatFriendRequestStatus.declined,
                            ),
                          ),
                          child: Text(context.l10n.chatDecline),
                        ),
                      ],
                    ),
                    _FriendRequestGroup(
                      title: context.l10n.chatOutgoing,
                      requests: state.friendRequests.outgoing,
                      actionsBuilder: (request) => [
                        shad.OutlineButton(
                          onPressed: () =>
                              unawaited(cubit.revokeFriendRequest(request)),
                          child: Text(context.l10n.commonCancel),
                        ),
                      ],
                    ),
                    _FriendRequestGroup(
                      title: context.l10n.chatAccepted,
                      requests: state.friendRequests.accepted,
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

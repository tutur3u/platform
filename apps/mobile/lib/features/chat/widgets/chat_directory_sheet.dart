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
    final l10n = context.l10n;
    return BlocBuilder<ChatCubit, ChatState>(
      builder: (context, state) {
        final cubit = context.read<ChatCubit>();
        return AppSheetScaffold(
          title: l10n.chatDirectory,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppTextField(
                controller: _searchController,
                label: l10n.chatSearchPeople,
                placeholder: l10n.chatSearchPeople,
                selectionControls: platformTextSelectionControls(),
                contextMenuBuilder: platformTextContextMenuBuilder(),
                onChanged: (value) => unawaited(cubit.searchDirectory(value)),
              ),
              const SizedBox(height: AppSpacing.md),
              _DirectoryResults(users: state.directoryResults),
              const SizedBox(height: AppSpacing.lg),
              Text(
                l10n.chatFriendRequests,
                style: AppTokens.of(
                  context,
                ).typography.large.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppTextField(
                controller: _emailController,
                label: l10n.chatEmailHint,
                placeholder: l10n.chatEmailHint,
                keyboardType: TextInputType.emailAddress,
                selectionControls: platformTextSelectionControls(),
                contextMenuBuilder: platformTextContextMenuBuilder(),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton.primary(
                onPressed: () {
                  unawaited(cubit.createFriendRequest(_emailController.text));
                  _emailController.clear();
                },
                child: Text(l10n.commonCreate),
              ),
              _FriendRequestGroup(
                title: l10n.chatIncoming,
                requests: state.friendRequests.incoming,
                actionsBuilder: (request) => [
                  AppButton.primary(
                    density: AppButtonDensity.compact,
                    onPressed: () => unawaited(
                      cubit.respondFriendRequest(
                        request,
                        ChatFriendRequestStatus.accepted,
                      ),
                    ),
                    child: Text(l10n.chatAccept),
                  ),
                  AppButton.outline(
                    density: AppButtonDensity.compact,
                    onPressed: () => unawaited(
                      cubit.respondFriendRequest(
                        request,
                        ChatFriendRequestStatus.declined,
                      ),
                    ),
                    child: Text(l10n.chatDecline),
                  ),
                ],
              ),
              _FriendRequestGroup(
                title: l10n.chatOutgoing,
                requests: state.friendRequests.outgoing,
                actionsBuilder: (request) => [
                  AppButton.outline(
                    density: AppButtonDensity.compact,
                    onPressed: () =>
                        unawaited(cubit.revokeFriendRequest(request)),
                    child: Text(l10n.commonCancel),
                  ),
                ],
              ),
              _FriendRequestGroup(
                title: l10n.chatAccepted,
                requests: state.friendRequests.accepted,
              ),
            ],
          ),
        );
      },
    );
  }
}

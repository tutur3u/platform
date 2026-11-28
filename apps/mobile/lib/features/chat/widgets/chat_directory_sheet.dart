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
              _DirectoryResults(users: state.visibleDirectoryResults),
              const SizedBox(height: AppSpacing.lg),
              Text(
                l10n.chatFriendRequests,
                style: AppTokens.of(context).typography.large
                    .copyWith(fontWeight: FontWeight.w700),
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
                requests: state.visibleFriendRequests.incoming,
                actionsBuilder: (request) => [
                  ..._safetyActions(context, cubit, request),
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
                requests: state.visibleFriendRequests.outgoing,
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
                requests: state.visibleFriendRequests.accepted,
              ),
            ],
          ),
        );
      },
    );
  }

  /// Report and Block for the person who sent an incoming request.
  List<Widget> _safetyActions(
    BuildContext context,
    ChatCubit cubit,
    ChatFriendRequest request,
  ) {
    final l10n = context.l10n;
    final requester = ChatUserProfile(
      id: request.requesterUserId.isNotEmpty
          ? request.requesterUserId
          : request.requester.id,
      displayName: request.requester.displayName,
      avatarUrl: request.requester.avatarUrl,
      handle: request.requester.handle,
    );
    if (requester.id.isEmpty) return const [];
    return [
      AppIconButton(
        key: ValueKey('chat-friend-report-${request.id}'),
        tooltip: l10n.chatSafetyReportUser(requester.displayName),
        density: AppButtonDensity.iconDense,
        icon: const Icon(LucideIcons.flag, size: 16),
        onPressed: () => unawaited(
          showChatReportSheet(context, cubit: cubit, subject: requester),
        ),
      ),
      AppIconButton(
        key: ValueKey('chat-friend-block-${request.id}'),
        tooltip: l10n.chatSafetyBlockUser(requester.displayName),
        density: AppButtonDensity.iconDense,
        icon: const Icon(LucideIcons.ban, size: 16),
        onPressed: () => unawaited(
          showChatBlockSheet(context, cubit: cubit, user: requester),
        ),
      ),
    ];
  }
}

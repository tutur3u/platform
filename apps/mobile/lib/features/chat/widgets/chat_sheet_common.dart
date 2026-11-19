part of 'chat_sheets.dart';

class _UserSelectionList extends StatelessWidget {
  const _UserSelectionList({
    required this.users,
    required this.selectedUserIds,
    required this.onToggle,
  });

  final List<ChatUserProfile> users;
  final Set<String> selectedUserIds;
  final ValueChanged<String> onToggle;

  @override
  Widget build(BuildContext context) {
    if (users.isEmpty) return Text(context.l10n.chatNoDirectoryResults);
    return Column(
      children: [
        for (final user in users)
          AppCheckboxRow(
            value: selectedUserIds.contains(user.id),
            onChanged: (_) => onToggle(user.id),
            title: Text(user.displayName),
            subtitle: user.handle == null ? null : Text(user.handle!),
          ),
      ],
    );
  }
}

class _DirectoryResults extends StatelessWidget {
  const _DirectoryResults({required this.users});

  final List<ChatUserProfile> users;

  @override
  Widget build(BuildContext context) {
    if (users.isEmpty) return Text(context.l10n.chatNoDirectoryResults);
    return AppGroupedSection(
      children: [
        for (final user in users)
          AppRichRow(
            title: user.displayName,
            subtitle: user.handle,
            leading: const AppIconTile(icon: LucideIcons.user),
          ),
      ],
    );
  }
}

class _FriendRequestGroup extends StatelessWidget {
  const _FriendRequestGroup({
    required this.title,
    required this.requests,
    this.actionsBuilder,
  });

  final String title;
  final List<ChatFriendRequest> requests;
  final List<Widget> Function(ChatFriendRequest request)? actionsBuilder;

  @override
  Widget build(BuildContext context) {
    if (requests.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.md),
      child: AppPanel(
        title: title,
        child: Column(
          children: [
            for (final request in requests)
              PendingSyncFrame(
                workspaceId: context.read<ChatCubit>().state.wsId ?? '',
                feature: 'chat',
                entityId: request.id,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${request.requester.displayName} -> '
                          '${request.recipient.displayName}',
                        ),
                      ),
                      if (actionsBuilder != null)
                        Wrap(
                          spacing: AppSpacing.xs,
                          children: actionsBuilder!(request),
                        ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

part of 'chat_sheets.dart';

class _SheetHeader extends StatelessWidget {
  const _SheetHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: Theme.of(
              context,
            ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
          ),
        ),
        shad.IconButton.ghost(
          icon: const Icon(shad.LucideIcons.x, size: 18),
          onPressed: () => unawaited(Navigator.maybePop(context)),
        ),
      ],
    );
  }
}

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
    return ConstrainedBox(
      constraints: const BoxConstraints(maxHeight: 220),
      child: ListView.builder(
        shrinkWrap: true,
        itemCount: users.length,
        itemBuilder: (context, index) {
          final user = users[index];
          return CheckboxListTile(
            value: selectedUserIds.contains(user.id),
            onChanged: (_) => onToggle(user.id),
            title: Text(user.displayName),
            subtitle: user.handle == null ? null : Text(user.handle!),
          );
        },
      ),
    );
  }
}

class _DirectoryResults extends StatelessWidget {
  const _DirectoryResults({required this.users});

  final List<ChatUserProfile> users;

  @override
  Widget build(BuildContext context) {
    if (users.isEmpty) return Text(context.l10n.chatNoDirectoryResults);
    return Column(
      children: users
          .map(
            (user) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const CircleAvatar(child: Icon(Icons.person_outline)),
              title: Text(user.displayName),
              subtitle: user.handle == null ? null : Text(user.handle!),
            ),
          )
          .toList(growable: false),
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
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 6),
          ...requests.map(
            (request) => Card(
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${request.requester.displayName} -> '
                        '${request.recipient.displayName}',
                      ),
                    ),
                    if (actionsBuilder != null)
                      Wrap(spacing: 6, children: actionsBuilder!(request)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

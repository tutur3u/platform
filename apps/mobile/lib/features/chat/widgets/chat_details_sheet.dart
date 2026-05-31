part of 'chat_sheets.dart';

class ChatDetailsSheet extends StatelessWidget {
  const ChatDetailsSheet({super.key});

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
              final conversation = state.selectedConversation;
              if (conversation == null) {
                return const SizedBox(
                  height: 180,
                  child: NovaLoadingIndicator(size: 36),
                );
              }
              return SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _SheetHeader(title: context.l10n.chatDetails),
                    const SizedBox(height: 14),
                    Text(
                      conversation.displayTitle(
                        fallback: context.l10n.chatUntitled,
                      ),
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    if (conversation.description?.trim().isNotEmpty == true)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(conversation.description!),
                      ),
                    const SizedBox(height: 18),
                    _MembersSection(members: conversation.members),
                    const SizedBox(height: 18),
                    _SharedContentSection(content: state.sharedContent),
                    if (conversation.type == ChatConversationType.ai) ...[
                      const SizedBox(height: 18),
                      _AiSettingsSection(settings: state.aiSettings),
                      if (state.canManageChat) ...[
                        const SizedBox(height: 18),
                        _AiObservabilitySection(
                          observability: state.aiObservability,
                        ),
                      ],
                    ],
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

class _MembersSection extends StatelessWidget {
  const _MembersSection({required this.members});

  final List<ChatConversationMember> members;

  @override
  Widget build(BuildContext context) {
    return _Section(
      title: context.l10n.chatMembers,
      children: members
          .map(
            (member) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const CircleAvatar(child: Icon(Icons.person_outline)),
              title: Text(member.user.displayName),
              subtitle: Text(member.role),
            ),
          )
          .toList(growable: false),
    );
  }
}

class _SharedContentSection extends StatelessWidget {
  const _SharedContentSection({required this.content});

  final ChatSharedContent? content;

  @override
  Widget build(BuildContext context) {
    final shared = content;
    if (shared == null) {
      return _Section(
        title: context.l10n.chatShared,
        children: const [NovaLoadingIndicator(size: 28)],
      );
    }
    final items = [
      ...shared.photos.map(
        (attachment) => '${context.l10n.chatPhotos}: ${attachment.filename}',
      ),
      ...shared.files.map(
        (attachment) => '${context.l10n.chatFiles}: ${attachment.filename}',
      ),
      ...shared.links.map((link) => '${context.l10n.chatLinks}: ${link.url}'),
    ];
    return _Section(
      title: context.l10n.chatShared,
      children: items.isEmpty
          ? [Text(context.l10n.chatNoSharedContent)]
          : items.map(Text.new).toList(growable: false),
    );
  }
}

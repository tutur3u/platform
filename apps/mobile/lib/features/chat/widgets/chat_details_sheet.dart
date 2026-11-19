part of 'chat_sheets.dart';

class ChatDetailsSheet extends StatelessWidget {
  const ChatDetailsSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocBuilder<ChatCubit, ChatState>(
      builder: (context, state) {
        final conversation = state.selectedConversation;
        if (conversation == null) {
          return AppSheetScaffold(
            title: l10n.chatDetails,
            child: const AppLoadingIndicator.page(),
          );
        }
        final tokens = AppTokens.of(context);
        return AppSheetScaffold(
          title: l10n.chatDetails,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                conversation.displayTitle(fallback: l10n.chatUntitled),
                style: tokens.typography.h4.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (conversation.description?.trim().isNotEmpty == true) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  conversation.description!,
                  style: tokens.typography.small.copyWith(
                    color: tokens.colorScheme.mutedForeground,
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              _MembersSection(members: conversation.members),
              const SizedBox(height: AppSpacing.lg),
              _SharedContentSection(content: state.sharedContent),
              if (conversation.type == ChatConversationType.ai) ...[
                const SizedBox(height: AppSpacing.lg),
                _AiSettingsSection(settings: state.aiSettings),
                if (state.canManageChat) ...[
                  const SizedBox(height: AppSpacing.lg),
                  _AiObservabilitySection(observability: state.aiObservability),
                ],
              ],
            ],
          ),
        );
      },
    );
  }
}

class _MembersSection extends StatelessWidget {
  const _MembersSection({required this.members});

  final List<ChatConversationMember> members;

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      title: context.l10n.chatMembers,
      padded: false,
      child: Column(
        children: [
          for (final member in members)
            AppRichRow(
              title: member.user.displayName,
              subtitle: member.role,
              leading: const AppIconTile(icon: LucideIcons.user),
            ),
        ],
      ),
    );
  }
}

class _SharedContentSection extends StatelessWidget {
  const _SharedContentSection({required this.content});

  final ChatSharedContent? content;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final shared = content;
    if (shared == null) {
      return AppPanel(
        title: l10n.chatShared,
        child: const AppLoadingIndicator(),
      );
    }
    final items = [
      ...shared.photos.map(
        (attachment) => '${l10n.chatPhotos}: ${attachment.filename}',
      ),
      ...shared.files.map(
        (attachment) => '${l10n.chatFiles}: ${attachment.filename}',
      ),
      ...shared.links.map((link) => '${l10n.chatLinks}: ${link.url}'),
    ];
    return AppPanel(
      title: l10n.chatShared,
      child: items.isEmpty
          ? Text(l10n.chatNoSharedContent)
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [for (final item in items) Text(item)],
            ),
    );
  }
}

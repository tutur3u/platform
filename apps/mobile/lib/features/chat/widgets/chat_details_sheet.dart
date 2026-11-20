part of 'chat_sheets.dart';

class ChatDetailsSheet extends StatefulWidget {
  const ChatDetailsSheet({this.currentUserId, super.key});

  final String? currentUserId;

  @override
  State<ChatDetailsSheet> createState() => _ChatDetailsSheetState();
}

class _ChatDetailsSheetState extends State<ChatDetailsSheet> {
  final TextEditingController _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

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
        final title = conversation.displayTitle(fallback: l10n.chatUntitled);
        final matches = _query.trim().isEmpty
            ? const <ChatMessage>[]
            : state.selectedMessages
                  .where(
                    (message) => message.content.toLowerCase().contains(
                      _query.trim().toLowerCase(),
                    ),
                  )
                  .toList(growable: false);
        final mine = _ownMember(conversation);
        final canLeave =
            !conversation.isReadOnlyAgent &&
            (conversation.type == ChatConversationType.direct ||
                conversation.type == ChatConversationType.group);
        final canArchive =
            !conversation.isReadOnlyAgent && !canLeave && state.canManageChat;
        return AppSheetScaffold(
          title: title,
          description: l10n.chatMembersCount(conversation.memberCount),
          leading: _DetailsAvatar(
            conversation: conversation,
            currentUserId: widget.currentUserId,
          ),
          search: AppSheetSearch(
            controller: _searchController,
            hint: l10n.chatSearchMessages,
            onChanged: (value) => setState(() => _query = value),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_query.trim().isNotEmpty)
                _SearchResults(matches: matches)
              else ...[
                _MembersSection(members: conversation.members),
                const SizedBox(height: AppSpacing.lg),
                _SharedContentSection(content: state.sharedContent),
                if (conversation.type == ChatConversationType.ai) ...[
                  const SizedBox(height: AppSpacing.lg),
                  _AiSettingsSection(settings: state.aiSettings),
                  if (state.canManageChat) ...[
                    const SizedBox(height: AppSpacing.lg),
                    _AiObservabilitySection(
                      observability: state.aiObservability,
                    ),
                  ],
                ],
                if (!conversation.isReadOnlyAgent &&
                    widget.currentUserId != null) ...[
                  const SizedBox(height: AppSpacing.lg),
                  _MuteRow(
                    muted: mine?.isMuted ?? false,
                    onChanged: (muted) {
                      final userId = widget.currentUserId;
                      if (userId == null) return;
                      unawaited(
                        context.read<ChatCubit>().setMuted(
                          conversation,
                          userId: userId,
                          muted: muted,
                        ),
                      );
                    },
                  ),
                ],
                if (canLeave || canArchive) ...[
                  const SizedBox(height: AppSpacing.xl),
                  if (canLeave)
                    _ActionButton(
                      label: l10n.chatLeaveConversation,
                      destructive: true,
                      onPressed: () => _confirmClose(
                        context,
                        conversation,
                        title: l10n.chatLeaveConversation,
                        message: l10n.chatLeaveConversationConfirm,
                        confirmLabel: l10n.chatLeaveConversation,
                      ),
                    ),
                  if (canArchive)
                    _ActionButton(
                      label: l10n.chatDeleteConversation,
                      destructive: true,
                      onPressed: () => _confirmClose(
                        context,
                        conversation,
                        title: l10n.chatDeleteConversation,
                        message: l10n.chatDeleteConversationConfirm,
                        confirmLabel: l10n.commonDelete,
                      ),
                    ),
                ],
              ],
            ],
          ),
        );
      },
    );
  }

  ChatConversationMember? _ownMember(ChatConversation conversation) {
    final userId = widget.currentUserId;
    if (userId == null) return null;
    for (final member in conversation.members) {
      if (member.userId == userId) return member;
    }
    return null;
  }

  Future<void> _confirmClose(
    BuildContext context,
    ChatConversation conversation, {
    required String title,
    required String message,
    required String confirmLabel,
  }) async {
    final cubit = context.read<ChatCubit>();
    final closed = await showAppAsyncConfirmDialog(
      context: context,
      title: title,
      message: message,
      confirmLabel: confirmLabel,
      cancelLabel: context.l10n.commonCancel,
      describeError: (error) => error.toString(),
      onConfirm: () async {
        final fallback = context.l10n.commonSomethingWentWrong;
        await cubit.deleteConversation(conversation);
        final stillOpen = cubit.state.conversations.any(
          (item) => item.id == conversation.id,
        );
        if (stillOpen) {
          throw StateError(cubit.state.error ?? fallback);
        }
      },
    );
    if (closed && context.mounted) Navigator.of(context).pop();
  }
}

class _DetailsAvatar extends StatelessWidget {
  const _DetailsAvatar({
    required this.conversation,
    required this.currentUserId,
  });

  final ChatConversation conversation;
  final String? currentUserId;

  @override
  Widget build(BuildContext context) {
    return switch (conversation.type) {
      ChatConversationType.ai => const AppIconTile(
        icon: LucideIcons.sparkles,
        tone: AppTone.primary,
        size: 40,
      ),
      ChatConversationType.channel => const AppIconTile(
        icon: LucideIcons.hash,
        size: 40,
      ),
      ChatConversationType.group => const AppIconTile(
        icon: LucideIcons.users,
        size: 40,
      ),
      ChatConversationType.direct => _person(context),
    };
  }

  Widget _person(BuildContext context) {
    final others = conversation.members.where(
      (member) => member.userId != currentUserId,
    );
    final person = others.isEmpty
        ? (conversation.members.isEmpty ? null : conversation.members.first)
        : others.first;
    final name = person?.user.displayName.trim() ?? '';
    final initial = name.isEmpty ? '?' : name.characters.first.toUpperCase();
    return NetworkAvatar(
      avatarUrl: person?.user.avatarUrl,
      radius: 20,
      child: Text(initial),
    );
  }
}

class _MembersSection extends StatelessWidget {
  const _MembersSection({required this.members});

  final List<ChatConversationMember> members;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppPanel(
      title: l10n.chatMembers,
      padded: false,
      child: members.isEmpty
          ? Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Text(l10n.chatNoMembers),
            )
          : Column(
              children: [
                for (final member in members)
                  AppRichRow(
                    title: member.user.displayName,
                    subtitle: member.role,
                    leading: NetworkAvatar(
                      avatarUrl: member.user.avatarUrl,
                      radius: AppLayout.rowLeadingSize / 2,
                      child: Text(
                        member.user.displayName.trim().isEmpty
                            ? '?'
                            : member.user.displayName.characters.first
                                  .toUpperCase(),
                      ),
                    ),
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
    if (shared.photos.isEmpty && shared.files.isEmpty && shared.links.isEmpty) {
      return AppPanel(
        title: l10n.chatShared,
        child: Text(l10n.chatNoSharedContent),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (shared.photos.isNotEmpty)
          _SharedGroup(
            title: l10n.chatPhotos,
            rows: [
              for (final photo in shared.photos)
                AppRichRow(
                  title: photo.filename,
                  leading: const AppIconTile(icon: LucideIcons.image),
                ),
            ],
          ),
        if (shared.files.isNotEmpty) ...[
          if (shared.photos.isNotEmpty) const SizedBox(height: AppSpacing.lg),
          _SharedGroup(
            title: l10n.chatFiles,
            rows: [
              for (final file in shared.files)
                AppRichRow(
                  title: file.filename,
                  leading: const AppIconTile(icon: LucideIcons.file),
                ),
            ],
          ),
        ],
        if (shared.links.isNotEmpty) ...[
          if (shared.photos.isNotEmpty || shared.files.isNotEmpty)
            const SizedBox(height: AppSpacing.lg),
          _SharedGroup(
            title: l10n.chatLinks,
            rows: [
              for (final link in shared.links)
                AppRichRow(
                  title: link.url,
                  leading: const AppIconTile(icon: LucideIcons.link),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _SharedGroup extends StatelessWidget {
  const _SharedGroup({required this.title, required this.rows});

  final String title;
  final List<Widget> rows;

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      title: title,
      padded: false,
      child: Column(children: rows),
    );
  }
}

class _SearchResults extends StatelessWidget {
  const _SearchResults({required this.matches});

  final List<ChatMessage> matches;

  @override
  Widget build(BuildContext context) {
    if (matches.isEmpty) {
      return AppStateMessage(
        icon: LucideIcons.search,
        title: context.l10n.chatNoSearchResults,
      );
    }
    return Column(
      children: [
        for (final message in matches)
          AppRichRow(
            title: message.content,
            subtitle: message.sender?.displayName,
            leading: const AppIconTile(icon: LucideIcons.messageSquare),
          ),
      ],
    );
  }
}

class _MuteRow extends StatelessWidget {
  const _MuteRow({required this.muted, required this.onChanged});

  final bool muted;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppPanel(
      title: l10n.chatNotifications,
      child: AppToggleRow(
        title: Text(l10n.chatMuteNotifications),
        subtitle: Text(l10n.chatMuteNotificationsDescription),
        value: muted,
        onChanged: onChanged,
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.onPressed,
    required this.destructive,
  });

  final String label;
  final VoidCallback onPressed;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final button = destructive
        ? AppButton.destructive(onPressed: onPressed, child: Text(label))
        : AppButton.secondary(onPressed: onPressed, child: Text(label));
    return SizedBox(width: double.infinity, child: button);
  }
}

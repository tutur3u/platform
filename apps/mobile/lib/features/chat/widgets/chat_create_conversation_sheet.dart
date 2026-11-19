part of 'chat_sheets.dart';

class ChatCreateConversationSheet extends StatefulWidget {
  const ChatCreateConversationSheet({super.key});

  @override
  State<ChatCreateConversationSheet> createState() =>
      _ChatCreateConversationSheetState();
}

class _ChatCreateConversationSheetState
    extends State<ChatCreateConversationSheet> {
  final TextEditingController _titleController = TextEditingController();
  final TextEditingController _descriptionController = TextEditingController();
  final TextEditingController _searchController = TextEditingController();
  final Set<String> _selectedUserIds = <String>{};
  ChatConversationType _type = ChatConversationType.channel;
  bool _creating = false;

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    if (_creating) return;
    setState(() => _creating = true);
    final cubit = context.read<ChatCubit>();
    final conversation = await cubit.createConversation(
      type: _type,
      title: _titleController.text.trim().isEmpty
          ? null
          : _titleController.text.trim(),
      description: _descriptionController.text.trim().isEmpty
          ? null
          : _descriptionController.text.trim(),
      participantUserIds: _selectedUserIds.toList(growable: false),
      aiEnabled: _type == ChatConversationType.ai ? true : null,
      autoReply: _type == ChatConversationType.ai ? true : null,
    );
    if (!mounted) return;
    setState(() => _creating = false);
    if (conversation != null) {
      await Navigator.maybePop(context);
    }
  }

  bool get _requiresParticipants =>
      _type == ChatConversationType.direct ||
      _type == ChatConversationType.group;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocBuilder<ChatCubit, ChatState>(
      builder: (context, state) {
        final canCreate =
            !_creating &&
            (!_requiresParticipants || _selectedUserIds.isNotEmpty);
        return AppSheetScaffold(
          title: l10n.chatCreateConversation,
          actions: [
            AppButton.primary(
              onPressed: canCreate ? () => unawaited(_create()) : null,
              loading: _creating,
              child: Text(l10n.chatCreate),
            ),
          ],
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.chatConversationType),
              const SizedBox(height: AppSpacing.sm),
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  for (final type in ChatConversationType.values)
                    AppChip(
                      label: Text(_typeLabel(context, type)),
                      selected: _type == type,
                      inMutuallyExclusiveGroup: true,
                      onSelected: (_) => setState(() => _type = type),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                controller: _titleController,
                label: l10n.chatConversationTitleHint,
                placeholder: l10n.chatConversationTitleHint,
                selectionControls: platformTextSelectionControls(),
                contextMenuBuilder: platformTextContextMenuBuilder(),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _descriptionController,
                label: l10n.chatConversationDescriptionHint,
                placeholder: l10n.chatConversationDescriptionHint,
                minLines: 2,
                maxLines: 4,
                selectionControls: platformTextSelectionControls(),
                contextMenuBuilder: platformTextContextMenuBuilder(),
              ),
              if (_type == ChatConversationType.direct ||
                  _type == ChatConversationType.group) ...[
                const SizedBox(height: AppSpacing.lg),
                AppTextField(
                  controller: _searchController,
                  label: l10n.chatSelectParticipants,
                  placeholder: l10n.chatSelectParticipants,
                  selectionControls: platformTextSelectionControls(),
                  contextMenuBuilder: platformTextContextMenuBuilder(),
                  onChanged: (value) => unawaited(
                    context.read<ChatCubit>().searchDirectory(value),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                _UserSelectionList(
                  users: state.directoryResults,
                  selectedUserIds: _selectedUserIds,
                  onToggle: (id) {
                    setState(() {
                      _selectedUserIds.contains(id)
                          ? _selectedUserIds.remove(id)
                          : _selectedUserIds.add(id);
                    });
                  },
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  String _typeLabel(BuildContext context, ChatConversationType type) {
    return switch (type) {
      ChatConversationType.ai => context.l10n.chatAi,
      ChatConversationType.channel => context.l10n.chatChannels,
      ChatConversationType.direct => context.l10n.chatDirect,
      ChatConversationType.group => context.l10n.chatGroups,
    };
  }
}

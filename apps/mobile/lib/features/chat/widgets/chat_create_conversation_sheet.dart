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
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

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
              final canCreate =
                  !_creating &&
                  (!_requiresParticipants || _selectedUserIds.isNotEmpty);
              return SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _SheetHeader(title: context.l10n.chatCreateConversation),
                    const SizedBox(height: 18),
                    Text(context.l10n.chatConversationType),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: ChatConversationType.values
                          .map(
                            (type) => ChoiceChip(
                              label: Text(_typeLabel(context, type)),
                              selected: _type == type,
                              onSelected: (_) => setState(() => _type = type),
                            ),
                          )
                          .toList(growable: false),
                    ),
                    const SizedBox(height: 16),
                    shad.TextField(
                      contextMenuBuilder: platformTextContextMenuBuilder(),
                      controller: _titleController,
                      hintText: context.l10n.chatConversationTitleHint,
                    ),
                    const SizedBox(height: 10),
                    shad.TextField(
                      contextMenuBuilder: platformTextContextMenuBuilder(),
                      controller: _descriptionController,
                      hintText: context.l10n.chatConversationDescriptionHint,
                      minLines: 2,
                      maxLines: 4,
                    ),
                    if (_type == ChatConversationType.direct ||
                        _type == ChatConversationType.group) ...[
                      const SizedBox(height: 16),
                      shad.TextField(
                        contextMenuBuilder: platformTextContextMenuBuilder(),
                        controller: _searchController,
                        hintText: context.l10n.chatSelectParticipants,
                        onChanged: (value) => unawaited(
                          context.read<ChatCubit>().searchDirectory(value),
                        ),
                      ),
                      const SizedBox(height: 10),
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
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      child: shad.PrimaryButton(
                        onPressed: canCreate
                            ? () => unawaited(_create())
                            : null,
                        child: _creating
                            ? const SizedBox.square(
                                dimension: 18,
                                child: shad.CircularProgressIndicator(),
                              )
                            : Text(context.l10n.chatCreate),
                      ),
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

  String _typeLabel(BuildContext context, ChatConversationType type) {
    return switch (type) {
      ChatConversationType.ai => context.l10n.chatAi,
      ChatConversationType.channel => context.l10n.chatChannels,
      ChatConversationType.direct => context.l10n.chatDirect,
      ChatConversationType.group => context.l10n.chatGroups,
    };
  }
}
